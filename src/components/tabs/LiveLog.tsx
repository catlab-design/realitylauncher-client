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
    const isPausedRef = useRef(false);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const logIdRef = useRef(0);
    const lastLevelRef = useRef<LogEntry["level"]>("info");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    
    // Vanilla/Fabric: "[13:56:16] [main/INFO]: ..."; Forge: "[22Oct2026 13:50:53.856] [main/INFO] ...".
    // Lines without a timestamp (stack traces, wrapped output) inherit the previous line's level.
    const parseLines = useCallback((content: string): LogEntry[] => {
        return content
            .split(/\r?\n/)
            .filter((line) => line.trim())
            .map((line) => {
                const timeMatch = line.match(/^\[(?:\d{1,2}[A-Za-z]{3}\d{4} )?(\d{2}:\d{2}:\d{2})/);
                let level = lastLevelRef.current;
                if (timeMatch) {
                    if (line.includes("/ERROR]") || line.includes("/FATAL]")) level = "error";
                    else if (line.includes("/WARN]")) level = "warn";
                    else if (line.includes("/DEBUG]")) level = "debug";
                    else level = "info";
                    lastLevelRef.current = level;
                }
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
        // Two sources: the launcher's log of the last launch (launcher.log,
        // from the Play press until the game starts) and the game's latest.log.
        let launchOffset = 0;
        let gameOffset = 0;
        let launchCreated = 0;
        let gameCreated = 0;
        const reset = () => {
            logIdRef.current = 0;
            lastLevelRef.current = "info";
            setLogs([]);
        };
        reset();

        // Play recreates launcher.log and the game rotates latest.log. A new file
        // has a new creation time; where the filesystem doesn't report one, a file
        // smaller than what was already read is the only sign.
        const replaced = (res: { size: number; created?: number }, offset: number, created: number) =>
            res.size < offset || (created > 0 && (res.created ?? 0) > 0 && res.created !== created);

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
                if (!isPausedRef.current) {
                    let launch = await window.api?.instanceTailLaunchLog?.(instanceId, launchOffset);
                    if (!cancelled && launch?.ok && replaced(launch, launchOffset, launchCreated)) {
                        // A new launch: start over, keeping the previous game's
                        // latest.log hidden until the game rotates it.
                        reset();
                        launch = await window.api?.instanceTailLaunchLog?.(instanceId, 0);
                    }
                    if (!cancelled && launch?.ok) {
                        launchOffset = launch.size;
                        launchCreated = launch.created ?? 0;
                        if (launch.content) append(launch.content);
                    }
                    let res = await window.api?.instanceTailLog?.(instanceId, gameOffset);
                    if (!cancelled && res?.ok && replaced(res, gameOffset, gameCreated)) {
                        res = await window.api?.instanceTailLog?.(instanceId, 0);
                    }
                    if (!cancelled && res?.ok) {
                        gameOffset = res.size;
                        gameCreated = res.created ?? 0;
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
                const launch = await window.api?.instanceTailLaunchLog?.(instanceId, 0);
                if (!cancelled && launch?.ok) {
                    launchOffset = launch.size;
                    launchCreated = launch.created ?? 0;
                    if (launch.content) append(launch.content);
                }
                const result = await window.api?.instanceReadLatestLog?.(instanceId);
                if (!cancelled && result?.ok) {
                    gameOffset = result.size;
                    gameCreated = result.created ?? 0;
                    // A latest.log last written before this launch began is the
                    // previous session's; wait for the game to start a new one.
                    const launchStarted = launch?.ok ? launch.created ?? 0 : 0;
                    const stale = launchStarted > 0 && (result.modified ?? 0) < launchStarted;
                    if (result.content && !stale) append(result.content);
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
    }, [isOpen, instanceId, parseLines, reloadKey]);

    const clearLogs = useCallback(() => {
        setLogs([]);
        logIdRef.current = 0;
    }, []);

    const copyLogs = useCallback(() => {
        const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
        navigator.clipboard.writeText(text);
    }, [logs]);

    const reloadLogs = useCallback(() => setReloadKey((k) => k + 1), []);

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
                                onClick={() => { isPausedRef.current = !isPaused; setIsPaused(!isPaused); }}
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
