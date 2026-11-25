use std::future::Future;
use std::sync::Arc;

use mail_auth::oauth::{self, Grant};
use mail_model::{Account, Authentication, CoreEvent, Credential, Error, Result, now_millis};

use crate::events::Events;
use crate::worker::Secret;

const REFRESH_MARGIN_MS: i64 = 5 * 60 * 1000;
const GRAPH_CONSENT_NEEDED: &str = "Microsoft needs a new sign-in to send this message: open the account settings and choose Sign in Again.";

pub type TokenCache = Arc<tokio::sync::Mutex<Option<(String, i64)>>>;

fn fresh(expires_at: i64, now: i64) -> bool {
    expires_at - now > REFRESH_MARGIN_MS
}

fn read(secret: &Secret) -> Option<String> {
    secret
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

fn store_refresh_token(
    account_id: &str,
    refresh_token: Option<String>,
    secret: &Secret,
    events: &Events,
) {
    if let Some(refresh_token) = refresh_token {
        let mut current = secret
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if current.as_deref() != Some(refresh_token.as_str()) {
            *current = Some(refresh_token.clone());
            events.emit(CoreEvent::SecretChanged {
                account_id: account_id.to_owned(),
                secret: refresh_token,
            });
        }
    }
}

pub fn keep_grant(
    account_id: &str,
    grant: Grant,
    secret: &Secret,
    cached: &mut Option<(String, i64)>,
    events: &Events,
) -> String {
    store_refresh_token(account_id, grant.refresh_token, secret, events);
    *cached = Some((grant.access_token.clone(), grant.expires_at));
    grant.access_token
}

async fn graph_access_token<F, R>(
    account_id: &str,
    tokens: &TokenCache,
    secret: &Secret,
    events: &Events,
    redeem: F,
) -> Result<String>
where
    F: FnOnce(String) -> R,
    R: Future<Output = Result<Grant>>,
{
    let _serialized = tokens.lock().await;
    let refresh_token = read(secret).ok_or(Error::Auth)?;
    let grant = redeem(refresh_token).await.map_err(|error| match error {
        Error::Auth => Error::Server(GRAPH_CONSENT_NEEDED.into()),
        other => other,
    })?;
    store_refresh_token(account_id, grant.refresh_token, secret, events);
    Ok(grant.access_token)
}

pub async fn graph_token(
    account: &Account,
    secret: &Secret,
    tokens: &TokenCache,
    events: &Events,
) -> Result<String> {
    graph_access_token(
        &account.id,
        tokens,
        secret,
        events,
        |refresh_token| async move { oauth::graph_grant(&refresh_token).await },
    )
    .await
}

async fn access_token<F, R>(
    account_id: &str,
    tokens: &TokenCache,
    secret: &Secret,
    events: &Events,
    refresh: F,
) -> Result<String>
where
    F: FnOnce(String) -> R,
    R: Future<Output = Result<Grant>>,
{
    let mut cached = tokens.lock().await;
    if let Some((token, expires_at)) = cached.as_ref()
        && fresh(*expires_at, now_millis())
    {
        return Ok(token.clone());
    }
    let refresh_token = read(secret).ok_or(Error::Auth)?;
    let grant = match refresh(refresh_token.clone()).await {
        Err(Error::Auth) => {
            let mut current = secret
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if current.as_deref() == Some(refresh_token.as_str()) {
                *current = None;
            }
            events.emit(CoreEvent::AuthRequired {
                account_id: account_id.to_owned(),
            });
            return Err(Error::Auth);
        }
        result => result?,
    };
    Ok(keep_grant(account_id, grant, secret, &mut cached, events))
}

pub fn token_credential(authentication: Authentication, token: String) -> Credential {
    match authentication {
        Authentication::Server => Credential::OAuthBearer(token),
        _ => Credential::AccessToken(token),
    }
}

pub async fn credential(
    account: &Account,
    secret: &Secret,
    tokens: &TokenCache,
    events: &Events,
) -> Result<Credential> {
    match account.authentication {
        Authentication::Password => read(secret).map(Credential::Password).ok_or(Error::Auth),
        provider => {
            let server = account.oauth_server.clone();
            let token = access_token(
                &account.id,
                tokens,
                secret,
                events,
                |refresh_token| async move {
                    oauth::refresh(provider, server.as_ref(), &refresh_token).await
                },
            )
            .await?;
            Ok(token_credential(provider, token))
        }
    }
}

#[cfg(test)]
#[path = "../../../tests/mail_sync/credentials.rs"]
mod tests;
