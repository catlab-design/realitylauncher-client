

import net from "node:net";





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


function createHandshakePacket(host: string, port: number): Buffer {
    const protocolVersion = writeVarInt(765); 
    const hostBuffer = Buffer.from(host, "utf8");
    const hostLength = writeVarInt(hostBuffer.length);
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port);
    const nextState = writeVarInt(1); 

    const payload = Buffer.concat([
        protocolVersion,
        hostLength,
        hostBuffer,
        portBuffer,
        nextState,
    ]);

    const packetId = writeVarInt(0); 
    const packetData = Buffer.concat([packetId, payload]);
    const packetLength = writeVarInt(packetData.length);

    return Buffer.concat([packetLength, packetData]);
}


function createStatusRequestPacket(): Buffer {
    const packetId = writeVarInt(0); 
    const packetLength = writeVarInt(packetId.length);
    return Buffer.concat([packetLength, packetId]);
}


function parseServerResponse(buffer: Buffer): any {
    let offset = 0;

    
    const packetLengthResult = readVarInt(buffer, offset);
    offset += packetLengthResult.bytesRead;

    
    const packetIdResult = readVarInt(buffer, offset);
    offset += packetIdResult.bytesRead;

    
    const jsonLengthResult = readVarInt(buffer, offset);
    offset += jsonLengthResult.bytesRead;

    
    const jsonString = buffer.slice(offset, offset + jsonLengthResult.value).toString("utf8");

    return JSON.parse(jsonString);
}


function cleanMotd(motd: string | { text?: string; extra?: any[] }): string {
    if (typeof motd === "string") {
        
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
            
            const handshake = createHandshakePacket(host, port);
            socket.write(handshake);

            
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

                
                if (response.version) {
                    status.version = response.version.name;
                }

                
                if (response.players) {
                    status.players = {
                        online: response.players.online || 0,
                        max: response.players.max || 0,
                    };
                }

                
                if (response.description) {
                    status.motd = cleanMotd(response.description);
                }

                
                if (response.favicon) {
                    status.favicon = response.favicon;
                }

                returnResult(status);
            } catch {
                
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

        
        socket.connect(port, host);
    });
}


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
