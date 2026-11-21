use serde::Serialize;
use serde_json::Value;
use std::io::Read;
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration, Instant};

/// Result of a Minecraft server-list status ping.
///
/// `motd`, `players.online/max`, `latency`, `version` and `favicon` keep their
/// original meaning; `motdRaw`, `protocol` and `players.sample` are additions.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPingResult {
    pub online: bool,
    pub host: String,
    pub port: u16,
    pub players: Option<PlayersInfo>,
    /// MOTD as plain text (legacy `§` codes and component styling removed).
    pub motd: Option<String>,
    /// The status response's raw `description`: a legacy `§` string or a chat component (with `extra`).
    pub motd_raw: Option<Value>,
    /// Round trip in ms (ping/pong packet, falling back to the status request's round trip).
    pub latency: Option<u64>,
    /// Version name (formatting codes removed).
    pub version: Option<String>,
    pub protocol: Option<i64>,
    /// Server icon as a `data:image/png;base64,...` URL.
    pub favicon: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayersInfo {
    pub online: u32,
    pub max: u32,
    /// Player names from the status sample (servers may hide or fake these).
    pub sample: Vec<String>,
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const READ_TIMEOUT: Duration = Duration::from_secs(5);
const PONG_TIMEOUT: Duration = Duration::from_secs(2);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(12);
/// Status responses are a few KB plus the favicon; anything far larger is not a Minecraft server.
const MAX_PACKET_LEN: usize = 4 * 1024 * 1024;
const PROTOCOL_VERSION: i32 = 765;

impl ServerPingResult {
    fn offline(host: String, port: u16, error: impl Into<String>) -> Self {
        ServerPingResult {
            online: false,
            host,
            port,
            players: None,
            motd: None,
            motd_raw: None,
            latency: None,
            version: None,
            protocol: None,
            favicon: None,
            error: Some(error.into()),
        }
    }
}

fn write_var_int(value: i32) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut val = value as u32;
    loop {
        if val & 0xFFFFFF80 == 0 {
            bytes.push(val as u8);
            return bytes;
        }
        bytes.push((val & 0x7F) as u8 | 0x80);
        val >>= 7;
    }
}

fn read_var_int(buf: &[u8], offset: &mut usize) -> Result<i32, String> {
    let mut value: i32 = 0;
    let mut shift = 0;
    loop {
        if *offset >= buf.len() {
            return Err("Buffer underflow reading VarInt".to_string());
        }
        let byte = buf[*offset];
        *offset += 1;
        value |= ((byte & 0x7F) as i32) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
        shift += 7;
        if shift > 35 {
            return Err("VarInt too large".to_string());
        }
    }
}

/// Length-prefixed packet: `VarInt(len) VarInt(id) payload`.
fn build_packet(id: i32, payload: &[u8]) -> Vec<u8> {
    let mut data = write_var_int(id);
    data.extend_from_slice(payload);
    let mut out = write_var_int(data.len() as i32);
    out.extend_from_slice(&data);
    out
}

async fn read_stream_var_int(socket: &mut TcpStream) -> Result<i32, String> {
    let mut value: i32 = 0;
    let mut shift = 0;
    loop {
        let byte = socket.read_u8().await.map_err(|e| format!("Read error: {e}"))?;
        value |= ((byte & 0x7F) as i32) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
        shift += 7;
        if shift > 35 {
            return Err("VarInt too large".to_string());
        }
    }
}

/// Reads one whole packet (the status JSON with a favicon spans many TCP reads).
async fn read_packet(socket: &mut TcpStream) -> Result<(i32, Vec<u8>), String> {
    let len = read_stream_var_int(socket).await?;
    if len <= 0 || len as usize > MAX_PACKET_LEN {
        return Err(format!("Invalid packet length {len}"));
    }
    let mut data = vec![0u8; len as usize];
    socket
        .read_exact(&mut data)
        .await
        .map_err(|e| format!("Read error: {e}"))?;
    let mut offset = 0;
    let id = read_var_int(&data, &mut offset)?;
    Ok((id, data.split_off(offset)))
}

/// Removes legacy `§x` formatting codes.
fn strip_legacy_codes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\u{a7}' {
            chars.next();
            continue;
        }
        out.push(c);
    }
    out
}

fn collect_text(value: &Value, out: &mut String, depth: u8) {
    if depth > 32 {
        return;
    }
    match value {
        Value::String(s) => out.push_str(s),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Array(items) => {
            for item in items {
                collect_text(item, out, depth + 1);
            }
        }
        Value::Object(obj) => {
            match obj.get("text") {
                Some(text @ (Value::String(_) | Value::Number(_) | Value::Bool(_))) => collect_text(text, out, depth + 1),
                _ => {
                    if let Some(key) = obj.get("translate").and_then(|v| v.as_str()) {
                        out.push_str(key);
                    }
                }
            }
            if let Some(extra) = obj.get("extra") {
                collect_text(extra, out, depth + 1);
            }
        }
        Value::Null => {}
    }
}

/// Plain text of a description: a legacy string, a chat component (incl. `extra`) or an array of them.
fn plain_text(value: &Value) -> String {
    let mut out = String::new();
    collect_text(value, &mut out, 0);
    strip_legacy_codes(&out)
}

/// Builds a host:port string TcpStream can resolve (brackets IPv6 literals).
fn socket_address(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{}]:{}", host, port)
    } else {
        format!("{}:{}", host, port)
    }
}

async fn measure_pong(socket: &mut TcpStream) -> Option<u64> {
    let payload = 0x5245_414C_4954_59i64.to_be_bytes();
    let start = Instant::now();
    socket.write_all(&build_packet(1, &payload)).await.ok()?;
    let (id, _) = timeout(PONG_TIMEOUT, read_packet(socket)).await.ok()?.ok()?;
    (id == 1).then(|| start.elapsed().as_millis() as u64)
}

async fn ping_inner(host: &str, port: u16) -> Result<ServerPingResult, String> {
    let addr = socket_address(host, port);
    let mut socket = match timeout(CONNECT_TIMEOUT, TcpStream::connect(&addr)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return Err(e.to_string()),
        Err(_) => return Err("Connection timeout".to_string()),
    };
    let _ = socket.set_nodelay(true);

    let host_bytes = host.as_bytes();
    let mut handshake = write_var_int(PROTOCOL_VERSION);
    handshake.extend_from_slice(&write_var_int(host_bytes.len() as i32));
    handshake.extend_from_slice(host_bytes);
    handshake.extend_from_slice(&port.to_be_bytes());
    handshake.extend_from_slice(&write_var_int(1));

    let mut request = build_packet(0, &handshake);
    request.extend_from_slice(&build_packet(0, &[]));
    let sent = Instant::now();
    socket
        .write_all(&request)
        .await
        .map_err(|e| format!("Write error: {e}"))?;

    let (packet_id, data) = match timeout(READ_TIMEOUT, read_packet(&mut socket)).await {
        Ok(result) => result?,
        Err(_) => return Err("Read timeout".to_string()),
    };
    let status_rtt = sent.elapsed().as_millis() as u64;
    if packet_id != 0 {
        return Err(format!("Unexpected packet id {packet_id}"));
    }

    let mut offset = 0;
    let json_len = read_var_int(&data, &mut offset).map_err(|_| "Failed to parse response".to_string())?;
    let end = offset.saturating_add(json_len.max(0) as usize).min(data.len());
    let response: Value = serde_json::from_slice(&data[offset..end]).map_err(|e| format!("JSON parse error: {e}"))?;

    let latency = measure_pong(&mut socket).await.unwrap_or(status_rtt);

    let version_obj = response.get("version");
    let version = version_obj
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| strip_legacy_codes(s).trim().to_string())
        .filter(|s| !s.is_empty());
    let protocol = version_obj.and_then(|v| v.get("protocol")).and_then(|v| v.as_i64());

    let players = response.get("players").map(|p| PlayersInfo {
        online: p.get("online").and_then(|v| v.as_u64()).unwrap_or(0).min(u32::MAX as u64) as u32,
        max: p.get("max").and_then(|v| v.as_u64()).unwrap_or(0).min(u32::MAX as u64) as u32,
        sample: p
            .get("sample")
            .and_then(|v| v.as_array())
            .map(|list| {
                list.iter()
                    .filter_map(|entry| entry.get("name").and_then(|n| n.as_str()))
                    .map(strip_legacy_codes)
                    .filter(|name| !name.trim().is_empty())
                    .take(20)
                    .collect()
            })
            .unwrap_or_default(),
    });

    let description = response.get("description").cloned();
    let motd = description.as_ref().map(plain_text);
    let favicon = response
        .get("favicon")
        .and_then(|v| v.as_str())
        .map(|s| s.chars().filter(|c| !c.is_whitespace()).collect::<String>())
        .filter(|s| s.starts_with("data:image/"));

    Ok(ServerPingResult {
        online: true,
        host: host.to_string(),
        port,
        players,
        motd,
        motd_raw: description,
        latency: Some(latency),
        version,
        protocol,
        favicon,
        error: None,
    })
}

#[tauri::command]
pub async fn server_ping(host: String, port: Option<u16>) -> ServerPingResult {
    let host = host.trim().trim_start_matches('[').trim_end_matches(']').to_string();
    let port = port.unwrap_or(25565);
    if host.is_empty() {
        return ServerPingResult::offline(host, port, "Empty host");
    }
    match timeout(TOTAL_TIMEOUT, ping_inner(&host, port)).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => ServerPingResult::offline(host, port, e),
        Err(_) => ServerPingResult::offline(host, port, "Connection timeout"),
    }
}

// ---------------------------------------------------------------------------
// servers.dat (the in-game multiplayer list)
// ---------------------------------------------------------------------------

/// One entry of an instance's `servers.dat`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedServer {
    pub name: String,
    pub ip: String,
    /// Cached server icon as a data URL, when the game stored one.
    pub icon: Option<String>,
}

enum Nbt {
    Compound(Vec<(String, Nbt)>),
    List(Vec<Nbt>),
    Str(String),
    Other,
}

/// Minimal big-endian NBT reader: enough to walk compounds, lists and strings; skips everything else.
struct NbtReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> NbtReader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.pos.checked_add(n)?;
        let slice = self.buf.get(self.pos..end)?;
        self.pos = end;
        Some(slice)
    }

    fn u8(&mut self) -> Option<u8> {
        self.take(1).map(|b| b[0])
    }

    fn len_i32(&mut self) -> Option<usize> {
        let b = self.take(4)?;
        let v = i32::from_be_bytes([b[0], b[1], b[2], b[3]]);
        Some(v.max(0) as usize)
    }

    fn string(&mut self) -> Option<String> {
        let b = self.take(2)?;
        let len = u16::from_be_bytes([b[0], b[1]]) as usize;
        // Modified UTF-8; lossy is fine for names and addresses.
        Some(String::from_utf8_lossy(self.take(len)?).into_owned())
    }

    fn payload(&mut self, tag: u8, depth: u8) -> Option<Nbt> {
        if depth > 64 {
            return None;
        }
        match tag {
            1 => self.take(1).map(|_| Nbt::Other),
            2 => self.take(2).map(|_| Nbt::Other),
            3 | 5 => self.take(4).map(|_| Nbt::Other),
            4 | 6 => self.take(8).map(|_| Nbt::Other),
            7 => {
                let n = self.len_i32()?;
                self.take(n).map(|_| Nbt::Other)
            }
            8 => self.string().map(Nbt::Str),
            9 => {
                let elem = self.u8()?;
                let n = self.len_i32()?;
                if elem == 0 || n == 0 {
                    return Some(Nbt::List(Vec::new()));
                }
                // Every element takes at least one byte, so this bounds bogus lengths.
                if n > self.buf.len().saturating_sub(self.pos) {
                    return None;
                }
                let mut items = Vec::with_capacity(n.min(1024));
                for _ in 0..n {
                    items.push(self.payload(elem, depth + 1)?);
                }
                Some(Nbt::List(items))
            }
            10 => {
                let mut fields = Vec::new();
                loop {
                    let t = self.u8()?;
                    if t == 0 {
                        break;
                    }
                    let name = self.string()?;
                    let value = self.payload(t, depth + 1)?;
                    fields.push((name, value));
                }
                Some(Nbt::Compound(fields))
            }
            11 => {
                let n = self.len_i32()?;
                self.take(n.checked_mul(4)?).map(|_| Nbt::Other)
            }
            12 => {
                let n = self.len_i32()?;
                self.take(n.checked_mul(8)?).map(|_| Nbt::Other)
            }
            _ => None,
        }
    }
}

fn nbt_get<'n>(fields: &'n [(String, Nbt)], key: &str) -> Option<&'n Nbt> {
    fields.iter().find(|(name, _)| name == key).map(|(_, value)| value)
}

fn nbt_str(fields: &[(String, Nbt)], key: &str) -> Option<String> {
    match nbt_get(fields, key) {
        Some(Nbt::Str(s)) => Some(s.clone()),
        _ => None,
    }
}

fn parse_servers_dat(bytes: &[u8]) -> Vec<SavedServer> {
    let mut reader = NbtReader { buf: bytes, pos: 0 };
    if reader.u8() != Some(10) || reader.string().is_none() {
        return Vec::new();
    }
    let Some(Nbt::Compound(root)) = reader.payload(10, 0) else {
        return Vec::new();
    };
    let Some(Nbt::List(servers)) = nbt_get(&root, "servers") else {
        return Vec::new();
    };
    servers
        .iter()
        .filter_map(|entry| {
            let Nbt::Compound(fields) = entry else { return None };
            let ip = nbt_str(fields, "ip")?.trim().to_string();
            if ip.is_empty() {
                return None;
            }
            let name = nbt_str(fields, "name").map(|n| strip_legacy_codes(&n)).unwrap_or_default();
            let icon = nbt_str(fields, "icon")
                .map(|b64| b64.chars().filter(|c| !c.is_whitespace()).collect::<String>())
                .filter(|b64| !b64.is_empty())
                .map(|b64| format!("data:image/png;base64,{b64}"));
            Some(SavedServer { name, ip, icon })
        })
        .collect()
}

fn read_servers_dat(path: &Path) -> Vec<SavedServer> {
    const MAX_FILE: u64 = 16 * 1024 * 1024;
    let Ok(raw) = std::fs::read(path) else {
        return Vec::new();
    };
    // The game writes it uncompressed; some tools gzip it.
    if raw.starts_with(&[0x1f, 0x8b]) {
        let mut decoded = Vec::new();
        let decoder = flate2::read::GzDecoder::new(raw.as_slice());
        if decoder.take(MAX_FILE).read_to_end(&mut decoded).is_err() {
            return Vec::new();
        }
        parse_servers_dat(&decoded)
    } else {
        parse_servers_dat(&raw)
    }
}

/// Servers saved in the instance's in-game multiplayer list (`<game dir>/servers.dat`), in list order.
#[tauri::command]
pub async fn instance_saved_servers(instance_id: String) -> Vec<SavedServer> {
    let path = crate::instances::get_instance_dir(&instance_id).join("servers.dat");
    tokio::task::spawn_blocking(move || read_servers_dat(&path))
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nbt_string(out: &mut Vec<u8>, s: &str) {
        out.extend_from_slice(&(s.len() as u16).to_be_bytes());
        out.extend_from_slice(s.as_bytes());
    }

    #[test]
    fn parses_servers_dat() {
        let mut b = vec![10];
        nbt_string(&mut b, "");
        b.push(9);
        nbt_string(&mut b, "servers");
        b.push(10);
        b.extend_from_slice(&2i32.to_be_bytes());
        // entry 1: name, ip, acceptTextures byte
        b.push(8);
        nbt_string(&mut b, "name");
        nbt_string(&mut b, "\u{a7}aHub");
        b.push(8);
        nbt_string(&mut b, "ip");
        nbt_string(&mut b, "play.example.com:25566");
        b.push(1);
        nbt_string(&mut b, "acceptTextures");
        b.push(1);
        b.push(0);
        // entry 2: no ip -> skipped
        b.push(8);
        nbt_string(&mut b, "name");
        nbt_string(&mut b, "Empty");
        b.push(0);
        b.push(0);
        let servers = parse_servers_dat(&b);
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "Hub");
        assert_eq!(servers[0].ip, "play.example.com:25566");
        assert!(parse_servers_dat(&b[..b.len() - 5]).is_empty());
    }

    #[test]
    fn plain_text_handles_components_and_codes() {
        let v: Value = serde_json::from_str(
            r#"{"text":"","extra":[{"text":"Hello ","color":"gold"},"§lWorld",{"translate":"x"}]}"#,
        )
        .unwrap();
        assert_eq!(plain_text(&v), "Hello Worldx");
        assert_eq!(plain_text(&Value::String("\u{a7}cRed \u{a7}rText".into())), "Red Text");
    }
}
