import React from "react";
import { cn } from "../../lib/utils";
import type { Server } from "../../types/launcher";

interface ServerMenuProps {
    servers: Server[];
    selectedServer: Server | null;
    setSelectedServer: (server: Server) => void;
    colors: any;
}

export function ServerMenu({
    servers,
    selectedServer,
    setSelectedServer,
    colors,
}: ServerMenuProps) {
    return (
        <div>
            <h2 className="text-xl font-medium mb-4" style={{ color: colors.onSurface }}>เซิร์ฟเวอร์ทั้งหมด</h2>
            {servers.length === 0 ? (
                <div className="p-8 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                    <p style={{ color: colors.onSurfaceVariant }}>ไม่มีเซิร์ฟเวอร์</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {servers.map((server) => (
                        <button
                            key={server.id}
                            onClick={() => setSelectedServer(server)}
                            className="p-4 rounded-xl text-left transition-all hover:shadow-md"
                            style={{ backgroundColor: colors.surfaceContainer, border: selectedServer?.id === server.id ? `2px solid ${colors.primary}` : "2px solid transparent" }}
                        >
                            <div className="flex gap-4">
                                <div className="w-16 h-16 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${server.image})` }} />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium" style={{ color: colors.onSurface }}>{server.name}</span>
                                        <span className={cn("w-2 h-2 rounded-full", server.status === "online" ? "bg-green-500" : "bg-red-500")} />
                                    </div>
                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{server.description}</p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
