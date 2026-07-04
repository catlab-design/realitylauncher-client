use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPingResult {
    pub online: bool,
    pub host: String,
    pub port: u16,
    pub players: Option<PlayersInfo>,
    pub motd: Option<String>,
    pub latency: Option<u64>,
    pub version: Option<String>,
    pub favicon: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayersInfo {
    pub online: u32,
    pub max: u32,
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

fn clean_motd(raw: &serde_json::Value) -> String {
    match raw {
        serde_json::Value::String(s) => {
            let cleaned: String = s.chars().filter(|&c| c != '\u{a7}').collect();
            cleaned
        }
        serde_json::Value::Object(obj) => {
            let mut text = obj
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(extra) = obj.get("extra").and_then(|v| v.as_array()) {
                for item in extra {
                    text.push_str(&clean_motd(item));
                }
            }
            text
        }
        _ => String::new(),
    }
}

#[tauri::command]
pub async fn server_ping(host: String, port: Option<u16>) -> ServerPingResult {
    let port = port.unwrap_or(25565);
    let addr = format!("{}:{}", host, port);
    let start = std::time::Instant::now();

    let stream = match timeout(Duration::from_secs(5), TcpStream::connect(&addr)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            return ServerPingResult {
                online: false,
                host: host.clone(),
                port,
                players: None,
                motd: None,
                latency: None,
                version: None,
                favicon: None,
                error: Some(e.to_string()),
            };
        }
        Err(_) => {
            return ServerPingResult {
                online: false,
                host: host.clone(),
                port,
                players: None,
                motd: None,
                latency: None,
                version: None,
                favicon: None,
                error: Some("Connection timeout".to_string()),
            };
        }
    };

    let mut socket = stream;
    
    let protocol_version = write_var_int(765);
    let host_bytes = host.as_bytes();
    let host_len = write_var_int(host_bytes.len() as i32);
    let port_be = port.to_be_bytes();
    let next_state = write_var_int(1);

    let mut handshake_payload = Vec::new();
    handshake_payload.extend_from_slice(&protocol_version);
    handshake_payload.extend_from_slice(&host_len);
    handshake_payload.extend_from_slice(host_bytes);
    handshake_payload.extend_from_slice(&port_be);
    handshake_payload.extend_from_slice(&next_state);

    let packet_id = write_var_int(0);
    let mut packet_data = Vec::new();
    packet_data.extend_from_slice(&packet_id);
    packet_data.extend_from_slice(&handshake_payload);

    let packet_len = write_var_int(packet_data.len() as i32);
    let mut handshake = Vec::new();
    handshake.extend_from_slice(&packet_len);
    handshake.extend_from_slice(&packet_data);

    if let Err(e) = socket.write_all(&handshake).await {
        return ServerPingResult {
            online: false,
            host,
            port,
            players: None,
            motd: None,
            latency: None,
            version: None,
            favicon: None,
            error: Some(format!("Write error: {e}")),
        };
    }

    
    let req_packet_id = write_var_int(0);
    let req_packet_len = write_var_int(req_packet_id.len() as i32);
    let mut request = Vec::new();
    request.extend_from_slice(&req_packet_len);
    request.extend_from_slice(&req_packet_id);

    if let Err(e) = socket.write_all(&request).await {
        return ServerPingResult {
            online: false,
            host,
            port,
            players: None,
            motd: None,
            latency: None,
            version: None,
            favicon: None,
            error: Some(format!("Write error: {e}")),
        };
    }

    
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    let read_result = timeout(Duration::from_secs(5), async {
        loop {
            let n = socket.read(&mut tmp).await?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&tmp[..n]);
            
            let mut offset = 0;
            if read_var_int(&buf, &mut offset).is_ok() {
                if read_var_int(&buf, &mut offset).is_ok() {
                    if read_var_int(&buf, &mut offset).is_ok() {
                        break; 
                    }
                }
            }
        }
        Ok::<_, std::io::Error>(())
    })
    .await;

    if read_result.is_err() {
        return ServerPingResult {
            online: false,
            host,
            port,
            players: None,
            motd: None,
            latency: None,
            version: None,
            favicon: None,
            error: Some("Read timeout".to_string()),
        };
    }

    let latency = start.elapsed().as_millis() as u64;

    
    let mut offset = 0;
    let _packet_len = match read_var_int(&buf, &mut offset) {
        Ok(v) => v,
        Err(e) => {
            return ServerPingResult {
                online: false,
                host,
                port,
                players: None,
                motd: None,
                latency: None,
                version: None,
                favicon: None,
                error: Some(e),
            };
        }
    };
    let _packet_id = read_var_int(&buf, &mut offset).unwrap_or(0);
    let json_len = match read_var_int(&buf, &mut offset) {
        Ok(v) => v as usize,
        Err(_) => {
            return ServerPingResult {
                online: false,
                host,
                port,
                players: None,
                motd: None,
                latency: None,
                version: None,
                favicon: None,
                error: Some("Failed to parse response".to_string()),
            };
        }
    };

    let json_bytes = &buf[offset..offset + json_len.min(buf.len() - offset)];
    let json_str = String::from_utf8_lossy(json_bytes);
    let response: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => {
            return ServerPingResult {
                online: false,
                host,
                port,
                players: None,
                motd: None,
                latency: None,
                version: None,
                favicon: None,
                error: Some(format!("JSON parse error: {e}")),
            };
        }
    };

    let version = response
        .get("version")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let players = response.get("players").map(|p| PlayersInfo {
        online: p.get("online").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        max: p.get("max").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
    });

    let motd = response.get("description").map(clean_motd);
    let favicon = response
        .get("favicon")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    ServerPingResult {
        online: true,
        host,
        port,
        players,
        motd,
        latency: Some(latency),
        version,
        favicon,
        error: None,
    }
}
