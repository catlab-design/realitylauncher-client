import { useRef, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

import type { InstallProgress } from "../types/launcher";

interface UseGameEventsProps {
    t: any;
    isInstalling: boolean;
    setInstalling: (val: boolean) => void;
    setInstallProgress: (val: InstallProgress | null) => void;
    setInstallMinimized: (val: boolean) => void;
    operationType: "install" | "repair" | "sync" | null;
    setOperationType: (val: "install" | "repair" | "sync" | null) => void;
    installingInstanceId: string | null;
    setInstallingInstanceId: (val: string | null) => void;
    loadInstances: () => void;
}

export function useGameEvents({
    t,
    isInstalling,
    setInstalling,
    setInstallProgress,
    setInstallMinimized,
    operationType,
    setOperationType,
    installingInstanceId,
    setInstallingInstanceId,
    loadInstances
}: UseGameEventsProps) {
    const isInstallingRef = useRef(isInstalling);
    const operationTypeRef = useRef(operationType);
    const lastInstallProgressRef = useRef<{ key: string; sentAt: number }>({ key: "", sentAt: 0 });
    const isCancellingRef = useRef(false);

    useEffect(() => {
        isInstallingRef.current = isInstalling;
    }, [isInstalling]);

    useEffect(() => {
        operationTypeRef.current = operationType;
    }, [operationType]);

    const setInstallingSafe = useCallback((next: boolean) => {
        if (isInstallingRef.current === next) return;
        isInstallingRef.current = next;
        setInstalling(next);
    }, [setInstalling]);

    const setOperationTypeSafe = useCallback((next: "install" | "repair" | "sync" | null) => {
        if (operationTypeRef.current === next) return;
        operationTypeRef.current = next;
        setOperationType(next);
    }, [setOperationType]);

    const setInstallProgressThrottled = useCallback((next: InstallProgress, force = false) => {
        const now = Date.now();
        const percent = typeof next.percent === "number" ? Math.round(next.percent) : undefined;
        const current = typeof next.current === "number" ? Math.round(next.current) : undefined;
        const total = typeof next.total === "number" ? Math.round(next.total) : undefined;
        const key = [
            next.type || "",
            next.stage || "",
            next.message || "",
            next.filename || "",
            percent ?? "",
            current ?? "",
            total ?? "",
        ].join("|");
        
        const critical =
            next.type === "sync-start" ||
            next.type === "sync-complete" ||
            next.type === "sync-error" ||
            next.type === "cancelled" ||
            next.type === "error" ||
            next.type === "complete" ||
            next.stage === "error" ||
            next.stage === "cancelled" ||
            next.stage === "complete";
            
        const due = now - lastInstallProgressRef.current.sentAt >= 120;
        const milestone = percent === undefined || percent === 0 || percent === 100 || percent % 5 === 0;

        if (force || critical || (due && (milestone || key !== lastInstallProgressRef.current.key))) {
            lastInstallProgressRef.current = { key, sentAt: now };
            setInstallProgress(next);
        }
    }, [setInstallProgress]);

    useEffect(() => {
        const removeListener = (window.api as any)?.onInstallProgress?.((data: any) => {
            if (isCancellingRef.current) return;

            setInstallProgressThrottled({
                stage: data.type,
                message: data.task,
                type: data.type,
                filename: data.filename,
                current: data.current,
                total: data.total,
                percent: data.percent
            });

            if (data.type === "complete" || data.percent === 100) {
                setTimeout(() => {
                    if (!isCancellingRef.current) {
                        setInstallingSafe(false);
                        setInstallProgress(null);
                        setInstallMinimized(false);
                        setOperationTypeSafe(null);
                        setInstallingInstanceId(null);
                        loadInstances();
                    }
                }, 1000);
            } else if (data.type === "error" || data.type === "cancelled" || data.type === "sync-error") {
                setInstallingSafe(false);
                setInstallProgress(null);
                setInstallMinimized(false);
                setOperationTypeSafe(null);
                setInstallingInstanceId(null);
            } else {
                if (!isInstallingRef.current) {
                    setOperationTypeSafe("install");
                    setInstallMinimized(false);
                }
                setInstallingSafe(true);
            }
        });

        const removeModpackListener = (window.api as any)?.onModpackInstallProgress?.((data: any) => {
            if (isCancellingRef.current) return;

            setInstallProgressThrottled({
                stage: data.stage,
                message: data.message,
                current: data.current,
                total: data.total,
                percent: data.percent
            });

            if (data.percent === 100 || data.stage === "complete") {
                setTimeout(() => {
                    if (!isCancellingRef.current) {
                        setInstallingSafe(false);
                        setInstallProgress(null);
                        setInstallMinimized(false);
                        setOperationTypeSafe(null);
                        setInstallingInstanceId(null);
                        loadInstances();
                    }
                }, 1000);
            } else if (data.stage === "error" || data.stage === "cancelled") {
                setInstallingSafe(false);
                setInstallProgress(null);
                setInstallMinimized(false);
                setOperationTypeSafe(null);
                setInstallingInstanceId(null);
            } else {
                if (!isInstallingRef.current) {
                    setOperationTypeSafe("install");
                    setInstallMinimized(false);
                }
                setInstallingSafe(true);
            }
        });

        return () => {
            removeListener?.();
            removeModpackListener?.();
        };
    }, [loadInstances, setInstallMinimized, setInstallProgress, setInstallingInstanceId, setInstallingSafe, setInstallProgressThrottled, setOperationTypeSafe]);

    const handleCancelInstall = async () => {
        isCancellingRef.current = true;
        try {
            if (installingInstanceId) {
                await (window.api as any)?.instanceCancelAction?.(installingInstanceId);
            }
            await (window.api as any)?.modpackCancelInstall?.();

            toast.error(t('cancel_install_success'));
            setInstalling(false);
            setInstallProgress(null);
            setInstallingInstanceId(null);
            setOperationType(null);
        } catch (e) {
            console.error("Failed to cancel install", e);
        } finally {
            setTimeout(() => {
                isCancellingRef.current = false;
            }, 1000);
        }
    };

    const handleRepair = async (id: string) => {
        setOperationType("repair");
        setInstalling(true);
        setInstallMinimized(false);
        setInstallProgress({ stage: "sync-start", message: t('sync-start' as any) });

        try {
            const result = await (window.api as any)?.instanceCheckIntegrity?.(id);
            if (result?.ok) {
                setTimeout(() => {
                    setInstalling(false);
                    setInstallProgress(null);
                    setOperationType(null);
                    toast.success(result.message || t('repair_success'));
                    loadInstances();
                }, 1000);
            } else {
                setInstalling(false);
                setInstallProgress(null);
                setOperationType(null);
                toast.error(result?.error || t('repair_failed'));
            }
        } catch (error: any) {
            setInstalling(false);
            setInstallProgress(null);
            setOperationType(null);
            toast.error(error?.message || t('error_occurred'));
        }
    };

    return {
        handleCancelInstall,
        handleRepair
    };
}
