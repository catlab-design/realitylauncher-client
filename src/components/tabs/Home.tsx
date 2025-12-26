import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { type AuthSession, type NewsItem, type Server } from "../../types/launcher";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";

interface Newsletter {
    id: string;
    subject: string;
    content: string;
    createdAt: string;
    sentAt: string | null;
}

interface HomeProps {
    session: AuthSession | null;
    news: NewsItem[];
    servers: Server[];
    selectedServer: Server | null;
    setSelectedServer: (server: Server) => void;
    colors: any;
}

export function Home({
    session,
    news,
    servers,
    selectedServer,
    setSelectedServer,
    colors,
}: HomeProps) {
    const [newsletters, setNewsletters] = useState<Newsletter[]>([]);

    // Fetch newsletters from API
    useEffect(() => {
        const fetchNewsletters = async () => {
            try {
                const res = await fetch("https://api.reality.notpumpkins.com/newsletter/list");
                if (res.ok) {
                    const data = await res.json();
                    setNewsletters(data.newsletters || []);
                }
            } catch {
                // Silent fail - just show no newsletters
            }
        };
        fetchNewsletters();
    }, []);

    // Get current hour for greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "อรุณสวัสดิ์" : hour < 18 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";

    return (
        <div className="space-y-8">
            {/* Hero Welcome Section */}
            <div
                className="relative rounded-3xl overflow-hidden p-8"
                style={{
                    background: `linear-gradient(135deg, ${colors.primary}15, ${colors.secondary}25)`,
                }}
            >
                {/* Background Pattern */}
                <div
                    className="absolute inset-0 opacity-5"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                />

                <div className="relative flex items-center gap-6">
                    {/* Avatar with glow effect */}
                    <div className="relative">
                        {session ? (
                            <>
                                <div
                                    className="absolute inset-0 rounded-2xl blur-xl opacity-50"
                                    style={{ backgroundColor: colors.primary }}
                                />
                                <MCHead
                                    username={session.username}
                                    size={80}
                                    className="relative rounded-2xl shadow-2xl ring-4 ring-white/20"
                                />
                            </>
                        ) : (
                            <div
                                className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.surfaceContainerHighest}, ${colors.surfaceContainer})`,
                                }}
                            >
                                <Icons.Person className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                            </div>
                        )}
                    </div>

                    <div className="flex-1">
                        <p className="text-sm font-medium mb-1" style={{ color: colors.secondary }}>
                            {greeting} 👋
                        </p>
                        <h1 className="text-3xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            {session ? session.username : "ยินดีต้อนรับสู่ Reality"}
                        </h1>
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                            {session
                                ? "พร้อมที่จะเริ่มการผจญภัยใหม่แล้วหรือยัง?"
                                : "เข้าสู่ระบบเพื่อเริ่มเล่นเกม"
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content - Stacked Layout */}
            <div className="space-y-8">
                {/* Newsletter Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: colors.onSurface }}>
                            <span className="w-1 h-5 rounded-full" style={{ backgroundColor: colors.secondary }} />
                            ข่าวสารและอัปเดต
                        </h3>
                        {newsletters.length > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: colors.primary + "20", color: colors.primary }}>
                                {newsletters.length} รายการ
                            </span>
                        )}
                    </div>

                    {/* Newsletter List */}
                    {newsletters.length === 0 ? (
                        <div
                            className="p-12 rounded-2xl text-center"
                            style={{ backgroundColor: colors.surfaceContainer }}
                        >
                            <Icons.News className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: colors.onSurfaceVariant }} />
                            <p style={{ color: colors.onSurfaceVariant }}>ยังไม่มีข่าวสาร</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {newsletters.map((item) => (
                                <div
                                    key={item.id}
                                    className="group p-5 rounded-2xl transition-all hover:scale-[1.01] hover:shadow-lg"
                                    style={{ backgroundColor: colors.surfaceContainer }}
                                >
                                    <div className="flex gap-4">
                                        {/* Newsletter Icon */}
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: colors.secondary + "20" }}
                                        >
                                            <i className="fa-solid fa-newspaper text-lg" style={{ color: colors.secondary }}></i>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span
                                                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                                                    style={{ backgroundColor: colors.secondary + "20", color: colors.secondary }}
                                                >
                                                    Newsletter
                                                </span>
                                                <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                    {new Date(item.sentAt || item.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                                </span>
                                            </div>
                                            <h4 className="font-semibold truncate group-hover:text-clip" style={{ color: colors.onSurface }}>
                                                {item.subject}
                                            </h4>
                                            <p className="text-sm line-clamp-2 mt-1" style={{ color: colors.onSurfaceVariant }}>
                                                {item.content}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Servers Section - Takes 1 column */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: colors.onSurface }}>
                            <span className="w-1 h-5 rounded-full" style={{ backgroundColor: colors.primary }} />
                            เซิร์ฟเวอร์
                        </h3>
                    </div>

                    {servers.length === 0 ? (
                        <div
                            className="p-8 rounded-2xl text-center"
                            style={{ backgroundColor: colors.surfaceContainer }}
                        >
                            <Icons.Server className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: colors.onSurfaceVariant }} />
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ไม่มีเซิร์ฟเวอร์</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {servers.slice(0, 4).map((server) => (
                                <button
                                    key={server.id}
                                    onClick={() => setSelectedServer(server)}
                                    className="w-full p-4 rounded-2xl text-left transition-all hover:scale-[1.02] hover:shadow-lg group"
                                    style={{
                                        backgroundColor: colors.surfaceContainer,
                                        border: selectedServer?.id === server.id
                                            ? `2px solid ${colors.primary}`
                                            : "2px solid transparent",
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Server Image */}
                                        <div
                                            className="w-12 h-12 rounded-xl bg-cover bg-center flex-shrink-0 shadow-md"
                                            style={{
                                                backgroundImage: server.image ? `url(${server.image})` : undefined,
                                                backgroundColor: !server.image ? colors.surfaceContainerHighest : undefined,
                                            }}
                                        >
                                            {!server.image && (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Icons.Server className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold truncate" style={{ color: colors.onSurface }}>
                                                    {server.name}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "w-2 h-2 rounded-full flex-shrink-0",
                                                        server.status === "online" ? "bg-green-500 animate-pulse" : "bg-red-500"
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span
                                                    className="text-xs px-2 py-0.5 rounded-full"
                                                    style={{
                                                        backgroundColor: colors.surfaceContainerHighest,
                                                        color: colors.onSurfaceVariant,
                                                    }}
                                                >
                                                    {server.version}
                                                </span>
                                                {server.players && (
                                                    <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                        <span style={{ color: colors.primary }}>{server.players.online}</span>/{server.players.max}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Play indicator */}
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                            style={{ backgroundColor: colors.primary }}
                                        >
                                            <Icons.Play className="w-3 h-3 text-white ml-0.5" />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
