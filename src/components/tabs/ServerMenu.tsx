import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import type { Server } from "../../types/launcher";

interface Instance {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    minecraftVersion: string | null;
    loaderType: string | null;
    status: string;
    memberType?: string;
}

interface ServerMenuProps {
    servers: Server[];
    selectedServer: Server | null;
    setSelectedServer: (server: Server) => void;
    colors: any;
    onInstanceSelect?: (instance: Instance) => void;
}

export function ServerMenu({
    servers,
    selectedServer,
    setSelectedServer,
    colors,
    onInstanceSelect,
}: ServerMenuProps) {
    const [instances, setInstances] = useState<{ owned: Instance[]; member: Instance[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [showKeyInput, setShowKeyInput] = useState(false);
    const [instanceKey, setInstanceKey] = useState("");
    const [keyError, setKeyError] = useState("");
    const [joiningKey, setJoiningKey] = useState(false);

    useEffect(() => {
        fetchInstances();
    }, []);

    const fetchInstances = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("authToken");
            if (!token) {
                setLoading(false);
                return;
            }

            const res = await fetch(`${(window as any).API_URL}/instances`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                setInstances(data);
            }
        } catch (error) {
            console.error("Failed to fetch instances:", error);
        }
        setLoading(false);
    };

    const handleJoinWithKey = async () => {
        if (!instanceKey.trim()) return;

        setJoiningKey(true);
        setKeyError("");

        try {
            const token = localStorage.getItem("authToken");
            const res = await fetch(`${(window as any).API_URL}/instances/join`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ key: instanceKey.trim() }),
            });

            const data = await res.json();

            if (res.ok) {
                setInstanceKey("");
                setShowKeyInput(false);
                fetchInstances();
            } else {
                setKeyError(data.error || "Invalid key");
            }
        } catch (error) {
            setKeyError("Failed to join instance");
        }
        setJoiningKey(false);
    };

    const handleInstanceClick = async (instance: Instance) => {
        onInstanceSelect?.(instance);

        // Convert instance to Server format for compatibility
        const asServer: Server = {
            id: instance.id,
            name: instance.name,
            description: instance.description || "",
            status: instance.status === "active" ? "online" : "offline",
            image: instance.iconUrl || "/default-server.png",
            ip: "",
            modpack: {
                name: instance.name,
                version: instance.minecraftVersion || "Unknown",
                loader: (instance.loaderType as any) || "vanilla",
                loaderVersion: "",
            },
        };
        setSelectedServer(asServer);
    };

    const allInstances = [
        ...(instances?.owned || []).map(i => ({ ...i, isOwned: true })),
        ...(instances?.member || []).map(i => ({ ...i, isOwned: false })),
    ];

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-medium" style={{ color: colors.onSurface }}>
                    เซิร์ฟเวอร์ทั้งหมด
                </h2>
                <button
                    onClick={() => setShowKeyInput(!showKeyInput)}
                    className="px-4 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                    style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}
                >
                    + เพิ่มด้วย Key
                </button>
            </div>

            {/* Key Input Section */}
            {showKeyInput && (
                <div
                    className="mb-4 p-4 rounded-xl"
                    style={{ backgroundColor: colors.surfaceContainer }}
                >
                    <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                        ใส่ Instance Key เพื่อเข้าร่วมเซิร์ฟเวอร์
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={instanceKey}
                            onChange={(e) => setInstanceKey(e.target.value.toUpperCase())}
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                            style={{
                                backgroundColor: colors.surface,
                                color: colors.onSurface,
                                border: `1px solid ${colors.outline}`,
                            }}
                            maxLength={19}
                        />
                        <button
                            onClick={handleJoinWithKey}
                            disabled={joiningKey || !instanceKey.trim()}
                            className="px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
                            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                        >
                            {joiningKey ? "..." : "เข้าร่วม"}
                        </button>
                    </div>
                    {keyError && (
                        <p className="text-sm mt-2" style={{ color: colors.error }}>
                            {keyError}
                        </p>
                    )}
                </div>
            )}

            {/* Loading State */}
            {loading ? (
                <div className="p-8 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                    <div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto mb-2"
                        style={{ borderColor: colors.primary, borderTopColor: "transparent" }} />
                    <p style={{ color: colors.onSurfaceVariant }}>กำลังโหลด...</p>
                </div>
            ) : allInstances.length === 0 && servers.length === 0 ? (
                <div className="p-8 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                    <p style={{ color: colors.onSurfaceVariant }}>
                        ไม่มีเซิร์ฟเวอร์ - ใช้ Instance Key เพื่อเข้าร่วม
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Instances from API */}
                    {allInstances.map((instance: any) => (
                        <button
                            key={instance.id}
                            onClick={() => handleInstanceClick(instance)}
                            className="p-4 rounded-xl text-left transition-all hover:shadow-md"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                border: selectedServer?.id === instance.id
                                    ? `2px solid ${colors.primary}`
                                    : "2px solid transparent",
                            }}
                        >
                            <div className="flex gap-4">
                                <div
                                    className="w-16 h-16 rounded-xl bg-cover bg-center flex items-center justify-center"
                                    style={{
                                        backgroundImage: instance.iconUrl ? `url(${instance.iconUrl})` : undefined,
                                        backgroundColor: instance.iconUrl ? undefined : colors.primaryContainer,
                                    }}
                                >
                                    {!instance.iconUrl && (
                                        <span className="text-2xl" style={{ color: colors.onPrimaryContainer }}>
                                            {instance.name[0]?.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium" style={{ color: colors.onSurface }}>
                                            {instance.name}
                                        </span>
                                        <span
                                            className={cn(
                                                "w-2 h-2 rounded-full",
                                                instance.status === "active" ? "bg-green-500" : "bg-red-500"
                                            )}
                                        />
                                        {instance.isOwned && (
                                            <span
                                                className="text-xs px-2 py-0.5 rounded"
                                                style={{ backgroundColor: colors.tertiaryContainer, color: colors.onTertiaryContainer }}
                                            >
                                                Owner
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                        {instance.description || `Minecraft ${instance.minecraftVersion || ""}`}
                                    </p>
                                    {instance.loaderType && (
                                        <span
                                            className="text-xs px-2 py-0.5 rounded inline-block mt-1"
                                            style={{ backgroundColor: colors.surface, color: colors.onSurfaceVariant }}
                                        >
                                            {instance.loaderType}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}

                    {/* Legacy servers (for backwards compatibility) */}
                    {servers.map((server) => (
                        <button
                            key={server.id}
                            onClick={() => setSelectedServer(server)}
                            className="p-4 rounded-xl text-left transition-all hover:shadow-md"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                border: selectedServer?.id === server.id
                                    ? `2px solid ${colors.primary}`
                                    : "2px solid transparent",
                            }}
                        >
                            <div className="flex gap-4">
                                <div
                                    className="w-16 h-16 rounded-xl bg-cover bg-center"
                                    style={{ backgroundImage: `url(${server.image})` }}
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium" style={{ color: colors.onSurface }}>
                                            {server.name}
                                        </span>
                                        <span
                                            className={cn(
                                                "w-2 h-2 rounded-full",
                                                server.status === "online" ? "bg-green-500" : "bg-red-500"
                                            )}
                                        />
                                    </div>
                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                        {server.description}
                                    </p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
