use std::collections::HashMap;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use mail_model::{
    Authentication, Error, OAuthServer, Result, Security, ServerConfig, ServerEndpoint, now_millis,
};
use ring::rand::SecureRandom;
use serde::Deserialize;

use crate::server::{MAIL_SCOPE, REDIRECT_URI};

const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const PERSONAL_TENANT: &str = "9188040d-6c67-4c5b-b112-36a304b66dad";
const GRAPH_SEND_SCOPE: &str = "https://graph.microsoft.com/Mail.Send";

struct Provider {
    authorize_url: &'static str,
    token_url: &'static str,
    client_id: &'static str,
    redirect_uri: &'static str,
    scope: &'static str,
    parameters: &'static [(&'static str, &'static str)],
}

const MICROSOFT: Provider = Provider {
    authorize_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    client_id: "37493326-2866-414d-bc1b-58b84101bac1",
    redirect_uri: "openmailbox://oauth",
    scope: "openid email profile offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
    parameters: &[("prompt", "select_account")],
};

#[cfg(target_os = "android")]
const GOOGLE_CLIENT: (&str, &str) = (
    "894628345620-57teil6uf23hnhek3in2g82b19b9ieac.apps.googleusercontent.com",
    "com.soluce.openmailbox:/oauth2redirect",
);

#[cfg(not(target_os = "android"))]
const GOOGLE_CLIENT: (&str, &str) = (
    "894628345620-n02dmit6km3lipioghk4r6unjnmr5l98.apps.googleusercontent.com",
    "com.googleusercontent.apps.894628345620-n02dmit6km3lipioghk4r6unjnmr5l98:/oauth2redirect",
);

const GOOGLE: Provider = Provider {
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    client_id: GOOGLE_CLIENT.0,
    redirect_uri: GOOGLE_CLIENT.1,
    scope: "openid email profile https://mail.google.com/",
    parameters: &[("access_type", "offline"), ("prompt", "select_account")],
};

fn provider(authentication: Authentication) -> Result<&'static Provider> {
    match authentication {
        Authentication::Microsoft => Ok(&MICROSOFT),
        Authentication::Google => Ok(&GOOGLE),
        Authentication::Password | Authentication::Server => {
            Err(Error::InvalidInput("not an OAuth provider".into()))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignInRequest {
    pub url: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone)]
pub struct PendingSignIn {
    pub provider: Authentication,
    pub state: String,
    pub verifier: String,
    pub redirect_uri: String,
    pub server: Option<OAuthServer>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub email: String,
    pub name: Option<String>,
    pub tenant: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Grant {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub identity: Option<Identity>,
}

pub fn begin(
    authentication: Authentication,
    login_hint: Option<&str>,
) -> Result<(SignInRequest, PendingSignIn)> {
    let provider = provider(authentication)?;
    let (verifier, challenge, state) = proof()?;
    let scope = match authentication {
        Authentication::Microsoft => format!("{} {GRAPH_SEND_SCOPE}", provider.scope),
        _ => provider.scope.to_owned(),
    };
    let mut parameters = vec![
        ("client_id", provider.client_id),
        ("response_type", "code"),
        ("redirect_uri", provider.redirect_uri),
        ("scope", scope.as_str()),
        ("state", state.as_str()),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
    ];
    parameters.extend_from_slice(provider.parameters);
    if let Some(hint) = login_hint {
        parameters.push(("login_hint", hint));
    }
    let url = url::Url::parse_with_params(provider.authorize_url, parameters)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
    Ok((
        SignInRequest {
            url: url.into(),
            redirect_uri: provider.redirect_uri.to_owned(),
        },
        PendingSignIn {
            provider: authentication,
            state,
            verifier,
            redirect_uri: provider.redirect_uri.to_owned(),
            server: None,
        },
    ))
}

fn proof() -> Result<(String, String, String)> {
    let mut random = [0u8; 32];
    ring::rand::SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| Error::InvalidInput("no randomness".into()))?;
    let verifier = URL_SAFE_NO_PAD.encode(random);
    let challenge = URL_SAFE_NO_PAD.encode(ring::digest::digest(
        &ring::digest::SHA256,
        verifier.as_bytes(),
    ));
    Ok((
        verifier,
        challenge,
        uuid::Uuid::new_v4().simple().to_string(),
    ))
}

pub fn begin_server(
    server: &OAuthServer,
    login_hint: &str,
    resources: &[&str],
) -> Result<(SignInRequest, PendingSignIn)> {
    let (verifier, challenge, state) = proof()?;
    let mut url = url::Url::parse(&server.authorization_endpoint)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("client_id", &server.client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", REDIRECT_URI)
            .append_pair("scope", MAIL_SCOPE)
            .append_pair("state", &state)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("prompt", "consent")
            .append_pair("login_hint", login_hint);
        for resource in resources {
            query.append_pair("resource", resource);
        }
    }
    Ok((
        SignInRequest {
            url: url.into(),
            redirect_uri: REDIRECT_URI.to_owned(),
        },
        PendingSignIn {
            provider: Authentication::Server,
            state,
            verifier,
            redirect_uri: REDIRECT_URI.to_owned(),
            server: Some(server.clone()),
        },
    ))
}

pub fn authorization_code(callback_url: &str, pending: &PendingSignIn) -> Result<String> {
    let url =
        url::Url::parse(callback_url).map_err(|error| Error::InvalidInput(error.to_string()))?;
    let mut answer: HashMap<String, String> = url.query_pairs().into_owned().collect();
    if answer.get("state") != Some(&pending.state) {
        return Err(Error::InvalidInput("unexpected sign-in answer".into()));
    }
    if let Some(server) = &pending.server
        && answer.get("iss") != Some(&server.issuer)
    {
        return Err(Error::InvalidInput(
            "sign-in answer from another server".into(),
        ));
    }
    if let Some(error) = answer.remove("error") {
        if answer.get("error_subcode").map(String::as_str) == Some("cancel") {
            return Err(Error::Cancelled);
        }
        return Err(Error::Server(
            answer.remove("error_description").unwrap_or(error),
        ));
    }
    answer
        .remove("code")
        .ok_or_else(|| Error::InvalidInput("sign-in answer without a code".into()))
}

fn exchange_form(pending: &PendingSignIn, code: &str) -> Vec<(&'static str, String)> {
    let mut form = vec![
        ("grant_type", "authorization_code".to_owned()),
        ("code", code.to_owned()),
        ("redirect_uri", pending.redirect_uri.clone()),
        ("code_verifier", pending.verifier.clone()),
    ];
    if pending.provider == Authentication::Microsoft {
        form.push(("scope", MICROSOFT.scope.to_owned()));
    }
    form
}

pub async fn exchange(pending: &PendingSignIn, code: &str) -> Result<Grant> {
    let target = token_target(pending.provider, pending.server.as_ref())?;
    request_token(target, exchange_form(pending, code)).await
}

fn token_target(
    authentication: Authentication,
    server: Option<&OAuthServer>,
) -> Result<(String, String)> {
    match (authentication, server) {
        (Authentication::Server, Some(server)) => {
            Ok((server.token_endpoint.clone(), server.client_id.clone()))
        }
        (Authentication::Server, None) => Err(Error::InvalidInput(
            "no OAuth server for this account".into(),
        )),
        (authentication, _) => {
            let provider = provider(authentication)?;
            Ok((provider.token_url.to_owned(), provider.client_id.to_owned()))
        }
    }
}

fn graph_refresh_form(refresh_token: &str) -> Vec<(&'static str, String)> {
    vec![
        ("grant_type", "refresh_token".to_owned()),
        ("refresh_token", refresh_token.to_owned()),
        ("scope", format!("{GRAPH_SEND_SCOPE} offline_access")),
    ]
}

pub async fn graph_grant(refresh_token: &str) -> Result<Grant> {
    let target = token_target(Authentication::Microsoft, None)?;
    request_token(target, graph_refresh_form(refresh_token)).await
}

fn refresh_form(
    authentication: Authentication,
    refresh_token: &str,
) -> Vec<(&'static str, String)> {
    let mut form = vec![
        ("grant_type", "refresh_token".to_owned()),
        ("refresh_token", refresh_token.to_owned()),
    ];
    if authentication == Authentication::Microsoft {
        form.push(("scope", MICROSOFT.scope.to_owned()));
    }
    form
}

pub async fn refresh(
    authentication: Authentication,
    server: Option<&OAuthServer>,
    refresh_token: &str,
) -> Result<Grant> {
    let target = token_target(authentication, server)?;
    request_token(target, refresh_form(authentication, refresh_token)).await
}

async fn request_token(
    (token_url, client_id): (String, String),
    mut form: Vec<(&'static str, String)>,
) -> Result<Grant> {
    form.push(("client_id", client_id));
    let (status, body) = tokio::task::spawn_blocking(move || post_form(&token_url, &form))
        .await
        .map_err(|error| Error::Network(error.to_string()))??;
    parse_grant(status, &body, now_millis())
}

fn post_form(url: &str, form: &[(&str, String)]) -> Result<(u16, String)> {
    let mut response = crate::http::agent(url, HTTP_TIMEOUT)
        .post(url)
        .send_form(form.iter().map(|(name, value)| (*name, value.as_str())))
        .map_err(|error| Error::Network(error.to_string()))?;
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|error| Error::Network(error.to_string()))?;
    Ok((status, body))
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    id_token: Option<String>,
    username: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct Claims {
    email: Option<String>,
    preferred_username: Option<String>,
    name: Option<String>,
    tid: Option<String>,
}

fn parse_grant(status: u16, body: &str, now: i64) -> Result<Grant> {
    if status == 429 || status >= 500 {
        return Err(Error::Network(format!(
            "sign-in service unavailable ({status})"
        )));
    }
    let response: TokenResponse = serde_json::from_str(body)
        .map_err(|_| Error::Network(format!("unreadable sign-in answer ({status})")))?;
    if let Some(error) = response.error {
        return Err(match error.as_str() {
            "invalid_grant" | "interaction_required" | "consent_required" | "login_required" => {
                Error::Auth
            }
            _ => Error::Server(response.error_description.unwrap_or(error)),
        });
    }
    let access_token = response
        .access_token
        .ok_or_else(|| Error::Server("no access token".into()))?;
    Ok(Grant {
        access_token,
        refresh_token: response.refresh_token,
        expires_at: now + response.expires_in.unwrap_or(3600) * 1000,
        identity: named(
            response.id_token.as_deref().and_then(identity),
            response.username,
        ),
    })
}

fn named(identity: Option<Identity>, username: Option<String>) -> Option<Identity> {
    let Some(username) = username
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty())
    else {
        return identity;
    };
    Some(match identity {
        Some(identity) => Identity {
            email: username,
            ..identity
        },
        None => Identity {
            email: username,
            name: None,
            tenant: None,
        },
    })
}

fn identity(id_token: &str) -> Option<Identity> {
    let payload = URL_SAFE_NO_PAD
        .decode(id_token.split('.').nth(1)?.trim_end_matches('='))
        .ok()?;
    let claims: Claims = serde_json::from_slice(&payload).ok()?;
    Some(Identity {
        email: claims
            .email
            .or(claims.preferred_username)?
            .trim()
            .to_owned(),
        name: claims.name.filter(|name| !name.trim().is_empty()),
        tenant: claims.tid,
    })
}

pub fn servers(authentication: Authentication, identity: &Identity) -> ServerConfig {
    let endpoint = |host: &str, port, security| ServerEndpoint {
        host: host.to_owned(),
        port,
        security,
    };
    let (imap, smtp) = match authentication {
        Authentication::Google => (
            endpoint("imap.gmail.com", 993, Security::Tls),
            endpoint("smtp.gmail.com", 465, Security::Tls),
        ),
        _ => (
            endpoint("outlook.office365.com", 993, Security::Tls),
            if identity.tenant.as_deref() == Some(PERSONAL_TENANT) {
                endpoint("smtp-mail.outlook.com", 587, Security::StartTls)
            } else {
                endpoint("smtp.office365.com", 587, Security::StartTls)
            },
        ),
    };
    ServerConfig {
        imap,
        smtp,
        username: identity.email.clone(),
        smtp_username: None,
    }
}

#[cfg(test)]
#[path = "../../../tests/mail_auth/oauth.rs"]
mod tests;
