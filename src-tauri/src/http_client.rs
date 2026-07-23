use once_cell::sync::Lazy;
use std::time::Duration;

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
