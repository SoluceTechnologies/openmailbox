use std::time::Duration;

pub(crate) fn agent(url: &str, timeout: Duration) -> ureq::Agent {
    let builder = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .http_status_as_error(false)
        .max_redirects(0);
    #[cfg(feature = "test-ca")]
    let builder = {
        let local = url::Url::parse(url).ok().is_some_and(|url| {
            matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "10.0.2.2"))
        });
        match option_env!("OPENMAILBOX_TEST_CA")
            .filter(|_| local)
            .and_then(|pem| ureq::tls::Certificate::from_pem(pem.as_bytes()).ok())
        {
            Some(certificate) => builder.tls_config(
                ureq::tls::TlsConfig::builder()
                    .root_certs(ureq::tls::RootCerts::new_with_certs(&[certificate]))
                    .build(),
            ),
            None => builder,
        }
    };
    #[cfg(not(feature = "test-ca"))]
    let _ = url;
    builder.build().into()
}
