use once_cell::sync::Lazy;
use std::time::Duration;

/// Header the Reality API reads to learn which launcher version is calling.
pub const LAUNCHER_VERSION_HEADER: &str = "x-launcher-version";

/// Add `X-Launcher-Version` to a request. Only for requests to the Reality API
/// (`api.reality.catlabdesign.space`); never send it to third-party hosts.
pub fn reality_api(rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    rb.header(LAUNCHER_VERSION_HEADER, env!("CARGO_PKG_VERSION"))
}

/// Postfix form of [`reality_api`]: `client.get(url).reality_api()`.
pub trait RealityApi {
    fn reality_api(self) -> Self;
}

impl RealityApi for reqwest::RequestBuilder {
    fn reality_api(self) -> Self {
        reality_api(self)
    }
}

/// Global HTTP client shared across the entire application.
///
/// Using a single client provides:
/// - Connection pooling (reuse TCP connections across requests)
/// - TLS session caching
/// - DNS caching
/// - HTTP/2 multiplexing (one TCP connection for concurrent downloads)
/// - Consistent timeouts and headers
///
/// Note: no total request timeout is set here — large file downloads (modpacks, JARs,
/// assets) can take minutes on slow connections. The connect_timeout prevents hanging
/// on unresponsive servers; per-request deadlines should use tokio::time::timeout.
pub static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("RealityLauncher/2.0")
        .connect_timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_keepalive(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .expect("Failed to build HTTP client")
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_headers_include_version() {
        let req = HTTP_CLIENT
            .get("https://api.reality.catlabdesign.space/x")
            .reality_api()
            .build()
            .unwrap();
        assert_eq!(
            req.headers().get("x-launcher-version").and_then(|v| v.to_str().ok()),
            Some(env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn non_reality_requests_carry_no_version_header() {
        let req = HTTP_CLIENT.get("https://api.modrinth.com/v2/project/x").build().unwrap();
        assert!(req.headers().get("x-launcher-version").is_none());
    }
}
