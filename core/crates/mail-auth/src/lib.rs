use std::time::Duration;

use mail_model::{Error, Result, Security, ServerConfig, ServerEndpoint};

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

struct KnownProvider {
    domains: &'static [&'static str],
    imap: (&'static str, u16, Security),
    smtp: (&'static str, u16, Security),
}

const KNOWN_PROVIDERS: &[KnownProvider] = &[
    KnownProvider {
        domains: &["gmail.com", "googlemail.com"],
        imap: ("imap.gmail.com", 993, Security::Tls),
        smtp: ("smtp.gmail.com", 465, Security::Tls),
    },
    KnownProvider {
        domains: &[
            "outlook.com",
            "hotmail.com",
            "hotmail.fr",
            "live.com",
            "live.fr",
            "msn.com",
        ],
        imap: ("outlook.office365.com", 993, Security::Tls),
        smtp: ("smtp-mail.outlook.com", 587, Security::StartTls),
    },
    KnownProvider {
        domains: &["icloud.com", "me.com", "mac.com"],
        imap: ("imap.mail.me.com", 993, Security::Tls),
        smtp: ("smtp.mail.me.com", 587, Security::StartTls),
    },
    KnownProvider {
        domains: &["yahoo.com", "yahoo.fr", "ymail.com"],
        imap: ("imap.mail.yahoo.com", 993, Security::Tls),
        smtp: ("smtp.mail.yahoo.com", 465, Security::Tls),
    },
    KnownProvider {
        domains: &["fastmail.com", "fastmail.fm"],
        imap: ("imap.fastmail.com", 993, Security::Tls),
        smtp: ("smtp.fastmail.com", 465, Security::Tls),
    },
];

fn endpoint((host, port, security): (&str, u16, Security)) -> ServerEndpoint {
    ServerEndpoint {
        host: host.to_owned(),
        port,
        security,
    }
}

pub async fn discover(email: &str) -> Result<ServerConfig> {
    let (local_part, domain) = email
        .trim()
        .rsplit_once('@')
        .filter(|(local_part, domain)| !local_part.is_empty() && domain.contains('.'))
        .ok_or_else(|| Error::InvalidInput("invalid email address".into()))?;
    let domain = domain.to_ascii_lowercase();
    if let Some(provider) = KNOWN_PROVIDERS
        .iter()
        .find(|provider| provider.domains.contains(&domain.as_str()))
    {
        return Ok(ServerConfig {
            imap: endpoint(provider.imap),
            smtp: endpoint(provider.smtp),
            username: email.to_owned(),
        });
    }
    let urls = [
        format!("https://autoconfig.{domain}/mail/config-v1.1.xml?emailaddress={email}"),
        format!("https://autoconfig.thunderbird.net/v1.1/{domain}"),
    ];
    for url in urls {
        let body = tokio::task::spawn_blocking(move || fetch(&url))
            .await
            .ok()
            .flatten();
        if let Some(config) =
            body.and_then(|xml| parse_autoconfig(&xml, email, local_part, &domain))
        {
            return Ok(config);
        }
    }
    Ok(ServerConfig {
        imap: ServerEndpoint {
            host: format!("imap.{domain}"),
            port: 993,
            security: Security::Tls,
        },
        smtp: ServerEndpoint {
            host: format!("smtp.{domain}"),
            port: 465,
            security: Security::Tls,
        },
        username: email.to_owned(),
    })
}

fn fetch(url: &str) -> Option<String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(HTTP_TIMEOUT))
        .build()
        .into();
    agent.get(url).call().ok()?.body_mut().read_to_string().ok()
}

fn parse_autoconfig(
    xml: &str,
    email: &str,
    local_part: &str,
    domain: &str,
) -> Option<ServerConfig> {
    let document = roxmltree::Document::parse(xml).ok()?;
    let server = |tag: &str, kind: &str| {
        document
            .descendants()
            .filter(|node| node.has_tag_name(tag) && node.attribute("type") == Some(kind))
            .filter_map(|node| {
                let text = |name: &str| {
                    node.children()
                        .find(|child| child.has_tag_name(name))?
                        .text()
                        .map(str::trim)
                };
                let security = match text("socketType")? {
                    "SSL" => Security::Tls,
                    "STARTTLS" => Security::StartTls,
                    _ => return None,
                };
                let username = text("username").unwrap_or("%EMAILADDRESS%");
                Some((
                    ServerEndpoint {
                        host: text("hostname")?.to_owned(),
                        port: text("port")?.parse().ok()?,
                        security,
                    },
                    username.to_owned(),
                ))
            })
            .min_by_key(|(endpoint, _)| endpoint.security != Security::Tls)
    };
    let (imap, username_template) = server("incomingServer", "imap")?;
    let (smtp, _) = server("outgoingServer", "smtp")?;
    let username = username_template
        .replace("%EMAILADDRESS%", email)
        .replace("%EMAILLOCALPART%", local_part)
        .replace("%EMAILDOMAIN%", domain);
    Some(ServerConfig {
        imap,
        smtp,
        username,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autoconfig_prefers_implicit_tls_and_expands_username() {
        let xml = r#"<clientConfig version="1.1"><emailProvider id="example.org">
            <incomingServer type="pop3"><hostname>pop.example.org</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
            <incomingServer type="imap"><hostname>imap.example.org</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></incomingServer>
            <incomingServer type="imap"><hostname>imap.example.org</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILLOCALPART%</username></incomingServer>
            <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>587</port><socketType>STARTTLS</socketType></outgoingServer>
            <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>25</port><socketType>plain</socketType></outgoingServer>
        </emailProvider></clientConfig>"#;
        let config = parse_autoconfig(xml, "jane@example.org", "jane", "example.org").unwrap();
        assert_eq!(config.imap.port, 993);
        assert_eq!(
            config.smtp,
            ServerEndpoint {
                host: "smtp.example.org".into(),
                port: 587,
                security: Security::StartTls
            }
        );
        assert_eq!(config.username, "jane");
    }
}
