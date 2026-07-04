import React, { useEffect, useState, useRef, useCallback } from "react";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { Portal } from "../ui/Portal";

interface LogEntry {
    id: number;
    timestamp: string;
    level: "info" | "warn" | "error" | "debug";
    message: string;
}

interface LiveLogProps {
    colors: any;
    isOpen: boolean;
    onClose: () => void;
    instanceId?: string | null;
}

export function LiveLog({ colors, isOpen, onClose, instanceId }: LiveLogProps) {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all");
    const [autoScroll, setAutoScroll] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const logIdRef = useRef(0);

    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    
    const parseLines = useCallback((content: string): LogEntry[] => {
        return content
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
                let level: LogEntry["level"] = "info";
                if (line.includes("/ERROR]") || line.includes("/FATAL]")) level = "error";
                else if (line.includes("/WARN]")) level = "warn";
                else if (line.includes("/DEBUG]")) level = "debug";

                const timeMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
                return {
                    id: logIdRef.current++,
                    timestamp: timeMatch ? timeMatch[1] : "",
                    level,
                    message: line,
                };
            });
    }, []);

    
    
    
    useEffect(() => {
        if (!isOpen || !instanceId) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let offset = 0;
        logIdRef.current = 0;
        setLogs([]);

        const append = (content: string) => {
            const entries = parseLines(content);
            if (entries.length === 0) return;
            setLogs((prev) => {
                const merged = [...prev, ...entries];
                return merged.length > 1000 ? merged.slice(-1000) : merged;
            });
        };

        const poll = async () => {
            if (cancelled) return;
            try {
                if (!isPaused) {
                    const res = await (window.api as any)?.instanceTailLog?.(instanceId, offset);
                    if (!cancelled && res?.ok) {
                        if (typeof res.size === "number") offset = res.size;
                        if (res.content) append(res.content);
                    }
                }
            } catch {
                
            }
            if (!cancelled) timer = setTimeout(poll, 1000);
        };

        const init = async () => {
            setIsLoadingFile(true);
            try {
                const result = await (window.api as any)?.instanceReadLatestLog?.(instanceId);
                if (!cancelled && result?.ok) {
                    if (typeof result.size === "number") offset = result.size;
                    if (result.content) append(result.content);
                }
            } catch (error) {
                console.error("[LiveLog] Failed to load log file:", error);
            } finally {
                if (!cancelled) setIsLoadingFile(false);
            }
            if (!cancelled) timer = setTimeout(poll, 1000);
        };

        init();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [isOpen, instanceId, isPaused, parseLines]);

    const clearLogs = useCallback(() => {
        setLogs([]);
        logIdRef.current = 0;
    }, []);

    const copyLogs = useCallback(() => {
        const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
        navigator.clipboard.writeText(text);
    }, [logs]);

    const reloadLogs = useCallback(async () => {
        if (!instanceId) return;
        setIsLoadingFile(true);
        try {
            const result = await (window.api as any)?.instanceReadLatestLog?.(instanceId);
            if (result?.ok && result.content) {
                const lines = result.content.split("\n").filter((line: string) => line.trim());
                const entries: LogEntry[] = lines.map((line: string, idx: number) => {
                    let level: LogEntry["level"] = "info";
                    if (line.includes("/ERROR]") || line.includes("/FATAL]")) level = "error";
                    else if (line.includes("/WARN]")) level = "warn";
                    else if (line.includes("/DEBUG]")) level = "debug";
                    const timeMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
                    const timestamp = timeMatch ? timeMatch[1] : "";
                    return { id: idx, timestamp, level, message: line };
                });
                setLogs(entries);
                logIdRef.current = entries.length;
            }
        } catch (error) {
            console.error("[LiveLog] Failed to reload log file:", error);
        } finally {
            setIsLoadingFile(false);
        }
    }, [instanceId]);

    const filteredLogs = filter === "all"
        ? logs
        : logs.filter(l => l.level === filter);

    const getLevelColor = (level: LogEntry["level"]) => {
        switch (level) {
            case "error": return "#ef4444";
            case "warn": return "#f59e0b";
            case "info": return "#3b82f6";
            case "debug": return "#6b7280";
            default: return colors.onSurface;
        }
    };

    const formatLogMessage = (msg: string) => {
        if (msg && msg.startsWith('t:')) {
            const parts = msg.substring(2).split('^^');
            const key = parts[0];
            
            if (key === 'crash_immediate') {
                return (t(key as any) || "").replace('{seconds}', parts[1]).replace('{code}', parts[2]);
            } else if (key === 'crash_reason') {
                return (t(key as any) || "").replace('{reason}', parts[1]);
            } else if (key === 'crash_log_saved') {
                return (t(key as any) || "").replace('{path}', parts[1]);
            }
            return t(key as any) || msg;
        }
        return msg;
    };

    if (!isOpen) return null;

    const filterLabels = {
        all: t("log_filter_all"),
        info: t("log_filter_info"),
        warn: t("log_filter_warn"),
        error: t("log_filter_error"),
    } as const;

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div
                    className="w-[94vw] max-w-[1500px] h-[76vh] min-h-[620px] max-h-[860px] rounded-2xl flex flex-col overflow-hidden relative z-51"
                    style={{ backgroundColor: colors.surfaceContainer }}
                >
                    <div
                        className="flex items-center justify-between gap-4 px-5 py-4 border-b shrink-0"
                        style={{ borderColor: colors.outline }}
                    >
                        <div className="flex items-center gap-3 shrink-0">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: colors.primary + "20" }}
                            >
                                <Icons.Terminal className="w-5 h-5" style={{ color: colors.primary }} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold" style={{ color: colors.onSurface }}>
                                    {t("game_logs")}
                                </h2>
                                <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                    {isLoadingFile
                                        ? t("loading")
                                        : t("entries_count").replace("{count}", String(logs.length))}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
                            <div className="flex rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                {(["all", "info", "warn", "error"] as const).map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setFilter(f)}
                                        className="px-3 py-1.5 text-xs font-medium transition-all"
                                        style={{
                                            backgroundColor: filter === f ? colors.primary : "transparent",
                                            color: filter === f ? colors.onPrimary : colors.onSurfaceVariant
                                        }}
                                    >
                                        {filterLabels[f].toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setAutoScroll(!autoScroll)}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0"
                                style={{
                                    backgroundColor: autoScroll ? colors.primary + "20" : colors.surfaceContainerHighest,
                                    color: autoScroll ? colors.primary : colors.onSurfaceVariant
                                }}
                                title={autoScroll ? t("auto_scroll_enabled") : t("auto_scroll_disabled")}
                            >
                                <Icons.ArrowDown className="w-4 h-4" />
                            </button>

                            <button
                                onClick={() => setIsPaused(!isPaused)}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0"
                                style={{
                                    backgroundColor: isPaused ? "#f59e0b20" : colors.surfaceContainerHighest,
                                    color: isPaused ? "#f59e0b" : colors.onSurfaceVariant
                                }}
                                title={isPaused ? t("resume_logging") : t("pause_logging")}
                            >
                                {isPaused ? <Icons.Play className="w-4 h-4" /> : <Icons.Pause className="w-4 h-4" />}
                            </button>

                            <button
                                onClick={reloadLogs}
                                disabled={isLoadingFile}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-black/10 disabled:opacity-50 shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                title={t("reload_logs")}
                            >
                                <Icons.Refresh className="w-4 h-4" />
                            </button>

                            <button
                                onClick={copyLogs}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-black/10 shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                title={t("copy_logs")}
                            >
                                <Icons.Copy className="w-4 h-4" />
                            </button>

                            <button
                                onClick={clearLogs}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-black/10 shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                title={t("clear_logs")}
                            >
                                <Icons.Trash className="w-4 h-4" />
                            </button>

                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-500 shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                title="Close"
                            >
                                <Icons.Close className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div
                        ref={logContainerRef}
                        className="flex-1 overflow-auto font-mono text-sm p-4 space-y-1"
                        style={{ backgroundColor: colors.surface }}
                    >
                        {isLoadingFile ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <Icons.Refresh className="w-12 h-12 mb-3 opacity-30 animate-spin" style={{ color: colors.onSurfaceVariant }} />
                                <p style={{ color: colors.onSurfaceVariant }}>{t("loading_logs")}</p>
                            </div>
                        ) : filteredLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <Icons.Terminal className="w-12 h-12 mb-3 opacity-30" style={{ color: colors.onSurfaceVariant }} />
                                <p style={{ color: colors.onSurfaceVariant }}>
                                    {logs.length === 0 ? t("no_logs_found_start_game") : t("no_logs_match_filter")}
                                </p>
                            </div>
                        ) : (
                            filteredLogs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex gap-3 py-0.5 hover:bg-white/5 rounded px-2 -mx-2 min-w-max"
                                >
                                    <span className="opacity-50 shrink-0 w-20" style={{ color: colors.onSurfaceVariant }}>
                                        {log.timestamp}
                                    </span>
                                    <span
                                        className="shrink-0 font-semibold w-16"
                                        style={{ color: getLevelColor(log.level) }}
                                    >
                                        [{log.level.toUpperCase()}]
                                    </span>
                                    <span style={{ color: colors.onSurface }} className="whitespace-pre">
                                        {formatLogMessage(log.message)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>

                    <div
                        className="flex items-center justify-between px-4 py-2 text-xs border-t shrink-0"
                        style={{ borderColor: colors.outline, backgroundColor: colors.surfaceContainer }}
                    >
                        <span style={{ color: colors.onSurfaceVariant }}>
                            {t("showing_logs_count")
                                .replace("{filtered}", String(filteredLogs.length))
                                .replace("{total}", String(logs.length))}
                        </span>
                        <div className="flex items-center gap-2">
                            {isPaused && (
                                <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-medium">
                                    {t("paused").toUpperCase()}
                                </span>
                            )}
                            {autoScroll && (
                                <span style={{ color: colors.onSurfaceVariant }}>
                                    {t("auto_scroll_on")}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}

export default LiveLog;
