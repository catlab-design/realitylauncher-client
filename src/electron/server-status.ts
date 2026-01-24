/**
 * ========================================
 * Minecraft Server Status Module
 * ========================================
 * 
 * ตรวจสอบสถานะของ Minecraft servers
 * - Ping server เพื่อดูว่า online หรือไม่
 * - ดึงข้อมูล MOTD, player count, version
 * - วัด latency
 */

import net from "node:net";

// ========================================
// Types
// ========================================

export interface ServerStatus {
    online: boolean;
    host: string;
    port: number;
    players?: {
        online: number;
        max: number;
    };
    motd?: string;
    latency?: number;
    version?: string;
    favicon?: string;
    error?: string;
}

export interface ServerPingOptions {
    host: string;
    port?: number;
    timeout?: number;
}

// ========================================
// Server Status Functions
// ========================================

/**
 * Parse Minecraft VarInt from buffer
 */
function readVarInt(buffer: Buffer, offset: number): { value: number; bytesRead: number } {
    let value = 0;
    let bytesRead = 0;
    let currentByte: number;

    do {
        if (bytesRead >= 5) {
            throw new Error("VarInt is too big");
        }
        if (offset + bytesRead >= buffer.length) {
            throw new Error("Buffer underflow");
        }
        currentByte = buffer[offset + bytesRead];
        value |= (currentByte & 0x7f) << (7 * bytesRead);
        bytesRead++;
    } while ((currentByte & 0x80) !== 0);

    return { value, bytesRead };
}

/**
 * Write Minecraft VarInt to buffer
 */
function writeVarInt(value: number): Buffer {
    const bytes: number[] = [];

    do {
        let temp = value & 0x7f;
        value >>>= 7;
        if (value !== 0) {
            temp |= 0x80;
        }
        bytes.push(temp);
    } while (value !== 0);

    return Buffer.from(bytes);
}

/**
 * Create handshake packet for Minecraft server
 */
function createHandshakePacket(host: string, port: number): Buffer {
    const protocolVersion = writeVarInt(765); // 1.20.4
    const hostBuffer = Buffer.from(host, "utf8");
    const hostLength = writeVarInt(hostBuffer.length);
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port);
    const nextState = writeVarInt(1); // Status

    const payload = Buffer.concat([
        protocolVersion,
        hostLength,
        hostBuffer,
        portBuffer,
        nextState,
    ]);

    const packetId = writeVarInt(0); // Handshake packet ID
    const packetData = Buffer.concat([packetId, payload]);
    const packetLength = writeVarInt(packetData.length);

    return Buffer.concat([packetLength, packetData]);
}

/**
 * Create status request packet
 */
function createStatusRequestPacket(): Buffer {
    const packetId = writeVarInt(0); // Status request packet ID
    const packetLength = writeVarInt(packetId.length);
    return Buffer.concat([packetLength, packetId]);
}

/**
 * Parse server response JSON
 */
function parseServerResponse(buffer: Buffer): any {
    let offset = 0;

    // Read packet length
    const packetLengthResult = readVarInt(buffer, offset);
    offset += packetLengthResult.bytesRead;

    // Read packet ID
    const packetIdResult = readVarInt(buffer, offset);
    offset += packetIdResult.bytesRead;

    // Read JSON string length
    const jsonLengthResult = readVarInt(buffer, offset);
    offset += jsonLengthResult.bytesRead;

    // Read JSON string
    const jsonString = buffer.slice(offset, offset + jsonLengthResult.value).toString("utf8");

    return JSON.parse(jsonString);
}

/**
 * Clean MOTD from color codes
 */
function cleanMotd(motd: string | { text?: string; extra?: any[] }): string {
    if (typeof motd === "string") {
        // Remove Minecraft color codes (§x)
        return motd.replace(/§[0-9a-fk-or]/gi, "");
    }

    if (typeof motd === "object") {
        let text = motd.text || "";
        if (motd.extra && Array.isArray(motd.extra)) {
            text += motd.extra.map((e: any) => (typeof e === "string" ? e : e.text || "")).join("");
        }
        return text.replace(/§[0-9a-fk-or]/gi, "");
    }

    return "";
}

/**
 * Ping a Minecraft Java Edition server
 */
export async function pingServer(options: ServerPingOptions): Promise<ServerStatus> {
    const { host, port = 25565, timeout = 5000 } = options;

    return new Promise((resolve) => {
        const startTime = Date.now();
        let responseBuffer = Buffer.alloc(0);
        let resolved = false;

        const socket = new net.Socket();

        const cleanup = () => {
            socket.removeAllListeners();
            socket.destroy();
        };

        const returnResult = (status: ServerStatus) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(status);
            }
        };

        socket.setTimeout(timeout);

        socket.on("connect", () => {
            // Send handshake
            const handshake = createHandshakePacket(host, port);
            socket.write(handshake);

            // Send status request
            const statusRequest = createStatusRequestPacket();
            socket.write(statusRequest);
        });

        socket.on("data", (data) => {
            const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            responseBuffer = Buffer.concat([responseBuffer, dataBuffer]);

            try {
                const response = parseServerResponse(responseBuffer);
                const latency = Date.now() - startTime;

                const status: ServerStatus = {
                    online: true,
                    host,
                    port,
                    latency,
                };

                // Parse version
                if (response.version) {
                    status.version = response.version.name;
                }

                // Parse players
                if (response.players) {
                    status.players = {
                        online: response.players.online || 0,
                        max: response.players.max || 0,
                    };
                }

                // Parse MOTD
                if (response.description) {
                    status.motd = cleanMotd(response.description);
                }

                // Parse favicon
                if (response.favicon) {
                    status.favicon = response.favicon;
                }

                returnResult(status);
            } catch {
                // Not enough data yet, wait for more
            }
        });

        socket.on("timeout", () => {
            returnResult({
                online: false,
                host,
                port,
                error: "Connection timeout",
            });
        });

        socket.on("error", (err) => {
            returnResult({
                online: false,
                host,
                port,
                error: err.message,
            });
        });

        socket.on("close", () => {
            if (!resolved) {
                returnResult({
                    online: false,
                    host,
                    port,
                    error: "Connection closed",
                });
            }
        });

        // Connect to server
        socket.connect(port, host);
    });
}

/**
 * Simple check if server is reachable (faster than full ping)
 */
export async function isServerOnline(host: string, port: number = 25565, timeout: number = 3000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });

        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });

        socket.on("error", () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}
