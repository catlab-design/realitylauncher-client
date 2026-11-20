import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import type { KeybindBackup } from "../../../types/launcher";

interface KeybindBackupsSectionProps {
    instanceId: string;
    colors: any;
    language: "th" | "en";
}

const REASON_KEYS = {
    manual: "keybind_reason_manual",
    "before-repair": "keybind_reason_before_repair",
    "before-restore": "keybind_reason_before_restore",
} as const;

function errorMessage(e: unknown): string {
    return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

export function KeybindBackupsSection({ instanceId, colors, language }: KeybindBackupsSectionProps) {
    const { t } = useTranslation(language);
    const [backups, setBackups] = useState<KeybindBackup[]>([]);
    const [running, setRunning] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmName, setConfirmName] = useState<string | null>(null);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refresh = useCallback(async () => {
        try {
            setBackups((await window.api?.keybindBackupsList(instanceId)) ?? []);
        } catch (e) {
            toast.error(errorMessage(e));
        }
    }, [instanceId]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        let alive = true;
        window.api?.isGameRunning(instanceId)
            .then((r) => { if (alive) setRunning(!!r); })
            .catch(() => { });
        const offStarted = window.api?.onGameStarted((d) => { if (d.instanceId === instanceId) setRunning(true); });
        const offStopped = window.api?.onGameStopped((d) => { if (d.instanceId === instanceId) setRunning(false); });
        return () => {
            alive = false;
            offStarted?.();
            offStopped?.();
        };
    }, [instanceId]);

    useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

    const handleCreate = async () => {
        setBusy(true);
        try {
            const entry = await window.api?.keybindBackupCreate(instanceId);
            if (entry === null) toast(t("keybind_backup_unchanged"));
            await refresh();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const handleRestore = async (name: string) => {
        setBusy(true);
        try {
            if (await window.api?.isGameRunning(instanceId)) {
                setRunning(true);
                toast.error(t("keybind_restore_running"));
                return;
            }
            await window.api?.keybindBackupRestore(instanceId, name);
            toast.success(t("keybind_restored"));
            await refresh();
        } catch (e) {
            const msg = errorMessage(e);
            toast.error(msg.includes("game-running") ? t("keybind_restore_running") : msg);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (name: string) => {
        if (confirmName !== name) {
            setConfirmName(name);
            if (confirmTimer.current) clearTimeout(confirmTimer.current);
            confirmTimer.current = setTimeout(() => setConfirmName(null), 3000);
            return;
        }
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        setConfirmName(null);
        setBusy(true);
        try {
            await window.api?.keybindBackupDelete(instanceId, name);
            await refresh();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const btn = "px-4 py-2 rounded-xl text-sm font-bold transition-all border flex items-center gap-2 shrink-0 disabled:opacity-50";
    const btnStyle = { borderColor: colors.outline + "30", color: colors.onSurface };

    return (
        <div className="p-4 rounded-xl transition-colors" style={{ backgroundColor: colors.surfaceContainerHighest }}>
            <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                    <h4 className="font-medium" style={{ color: colors.onSurface }}>{t("keybind_backups")}</h4>
                    <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>{t("keybind_backups_desc")}</p>
                </div>
                <button
                    onClick={() => { playClick(); handleCreate(); }}
                    disabled={busy}
                    className={btn + " hover:brightness-110"}
                    style={btnStyle}
                >
                    <Icons.History className="w-4 h-4" />
                    {t("keybind_backup_now")}
                </button>
            </div>
            <div className="mt-3 space-y-2">
                {backups.length === 0 && (
                    <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>{t("keybind_backup_none")}</p>
                )}
                {backups.map((b) => (
                    <div key={b.name} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                            <div style={{ color: colors.onSurface }}>
                                {new Date(b.createdAt).toLocaleString(language === "th" ? "th-TH" : "en-US")}
                            </div>
                            <div className="opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                {t(REASON_KEYS[b.reason])} · {t("keybind_key_count", { count: b.keyCount })}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => { playClick(); handleRestore(b.name); }}
                                disabled={busy || running}
                                title={running ? t("keybind_restore_running") : undefined}
                                className={btn + " hover:brightness-110"}
                                style={btnStyle}
                            >
                                {t("keybind_restore")}
                            </button>
                            <button
                                onClick={() => { playClick(); handleDelete(b.name); }}
                                disabled={busy}
                                className={btn + " hover:bg-red-500 hover:text-white"}
                                style={btnStyle}
                            >
                                <Icons.Trash className="w-4 h-4" />
                                {confirmName === b.name ? t("keybind_delete_confirm") : t("keybind_delete")}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
