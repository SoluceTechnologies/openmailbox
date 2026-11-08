use std::time::Duration;

use lettre::address::Envelope;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use mail_model::{Error, Result, Security, ServerEndpoint};

const TIMEOUT: Duration = Duration::from_secs(60);

fn transport(
    endpoint: &ServerEndpoint,
    username: &str,
    password: &str,
) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
    let builder = match endpoint.security {
        Security::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(&endpoint.host),
        Security::StartTls => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&endpoint.host),
    }
    .map_err(|error| Error::InvalidInput(error.to_string()))?;
    #[cfg(feature = "test-ca")]
    let builder = match option_env!("OPENMAILBOX_TEST_CA") {
        Some(pem) => {
            use lettre::transport::smtp::client::{Certificate, Tls, TlsParameters};
            let certificate = Certificate::from_pem(pem.as_bytes())
                .map_err(|error| Error::InvalidInput(error.to_string()))?;
            let parameters = TlsParameters::builder(endpoint.host.clone())
                .add_root_certificate(certificate)
                .build_rustls()
                .map_err(|error| Error::InvalidInput(error.to_string()))?;
            builder.tls(match endpoint.security {
                Security::Tls => Tls::Wrapper(parameters),
                Security::StartTls => Tls::Required(parameters),
            })
        }
        None => builder,
    };
    Ok(builder
        .port(endpoint.port)
        .timeout(Some(TIMEOUT))
        .credentials(Credentials::new(username.to_owned(), password.to_owned()))
        .build())
}

fn map_error(error: lettre::transport::smtp::Error) -> Error {
    if error.is_permanent() {
        let message = error.to_string();
        if error
            .status()
            .is_some_and(|code| code.to_string().starts_with("53"))
        {
            return Error::Auth;
        }
        return Error::Server(message);
    }

    Error::Network(error.to_string())
}

pub async fn verify(endpoint: &ServerEndpoint, username: &str, password: &str) -> Result<()> {
    let connected = transport(endpoint, username, password)?
        .test_connection()
        .await
        .map_err(map_error)?;
    if connected {
        Ok(())
    } else {
        Err(Error::Network("SMTP server unreachable".into()))
    }
}

pub async fn send(
    endpoint: &ServerEndpoint,
    username: &str,
    password: &str,
    envelope_from: &str,
    recipients: &[String],
    raw: &[u8],
) -> Result<()> {
    let parse = |address: &str| {
        address
            .parse()
            .map_err(|_| Error::InvalidInput(format!("invalid address: {address}")))
    };
    let recipients = recipients
        .iter()
        .map(|address| parse(address))
        .collect::<Result<Vec<_>>>()?;
    let envelope = Envelope::new(Some(parse(envelope_from)?), recipients)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
    transport(endpoint, username, password)?
        .send_raw(&envelope, raw)
        .await
        .map_err(map_error)?;
    Ok(())
}
