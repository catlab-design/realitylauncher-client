import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import type { GameInstance, Server, AuthSession } from "../types/launcher";

interface UseInstancesProps {
    session?: AuthSession | null;
    t: any;
    isActive?: boolean;
    selectedInstance?: GameInstance | null;
    setSelectedInstance?: (instance: GameInstance | null | ((prev: GameInstance | null) => GameInstance | null)) => void;
}

export function useInstances({ session, t, isActive, selectedInstance, setSelectedInstance }: UseInstancesProps) {
    const [instances, setInstances] = useState<GameInstance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [playingInstances, setPlayingInstances] = useState<Set<string>>(new Set());
    const [joinedServers, setJoinedServers] = useState<Server[]>([]);
    const [loadingServers, setLoadingServers] = useState(false);
    const hasLoadedRef = useRef(false);
    const wasActiveRef = useRef(isActive);

    const loadInstances = useCallback(async () => {
        if (!hasLoadedRef.current) {
            setIsLoading(true);
        }
        try {
            const allInstances = await window.api?.instancesList?.(0, 1000);
            if (allInstances) {
                setInstances(allInstances);
                hasLoadedRef.current = true;
            }
        } catch (error) {
            console.error("[useInstances] Failed to load instances:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadJoinedServers = useCallback(async () => {
        if (joinedServers.length === 0) {
            setLoadingServers(true);
        }
        try {
            const result = await (window.api as any)?.instancesGetJoinedServers?.();
            if (result?.ok && result.data) {
                const all = [...(result.data.owned || []), ...(result.data.member || [])];
                const unique = all.filter((v: Server, i: number, a: Server[]) => a.findIndex(t => t.id === v.id) === i);
                setJoinedServers(unique);
            } else if (result?.error) {
                const errMsg = typeof result.error === 'string' ? result.error : '';
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                    console.warn("[useInstances] Session expired, user needs to re-login");
                } else if (!errMsg.includes("Not logged in")) {
                    console.error("[useInstances] Failed to fetch joined servers:", errMsg);
                }
            }
        } catch (e) {
            console.error("Failed to fetch joined servers", e);
        } finally {
            setLoadingServers(false);
        }
    }, [joinedServers.length]);

    
    useEffect(() => {
        loadJoinedServers();
        loadInstances();

        const cleanup = window.api?.onInstancesUpdated?.(() => {
            console.log("[useInstances] Instances updated event received, reloading...");
            loadInstances();
        });

        return () => cleanup?.();
    }, [session, loadJoinedServers, loadInstances]);

    
    useEffect(() => {
        if (isActive && !wasActiveRef.current) {
             if (!selectedInstance) {
                loadInstances();
                loadJoinedServers();
             }
        }
        wasActiveRef.current = isActive;
    }, [isActive, selectedInstance, loadInstances, loadJoinedServers]);

    
    useEffect(() => {
        if (selectedInstance && setSelectedInstance && instances.length > 0) {
            const fresh = instances.find(i => i.id === selectedInstance.id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedInstance)) {
                console.log("[useInstances] Updating selected instance with fresh data");
                setSelectedInstance(fresh);
            }
        }
    }, [instances, selectedInstance, setSelectedInstance]);

    
    useEffect(() => {
        if (instances.length > 0) {
            const syncStatuses = async () => {
                const results = await Promise.all(
                    instances.map(async (inst) => {
                        try {
                            const isRunning = await window.api?.isGameRunning?.(inst.id);
                            return isRunning ? inst.id : null;
                        } catch { return null; }
                    })
                );
                const runningIds = new Set<string>(results.filter((id): id is string => id !== null));
                setPlayingInstances(runningIds);
            };
            syncStatuses();
        }
    }, [instances]);

    
    useEffect(() => {
        const removeStartedListener = (window.api as any).onGameStarted((data: any) => {
            console.log("[useInstances] Game Started Event:", data);
            setPlayingInstances(prev => new Set(prev).add(data.instanceId));
        });

        const removeStoppedListener = (window.api as any).onGameStopped((data: any) => {
            console.log("[useInstances] Game Stopped Event:", data);
            setPlayingInstances(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.instanceId);
                return newSet;
            });
        });

        return () => {
            removeStartedListener?.();
            removeStoppedListener?.();
        };
    }, []);

    const handleDelete = async (id: string) => {
        setInstances(prev => prev.filter(inst => inst.id !== id));
        try {
            const success = await window.api?.instancesDelete?.(id);
            if (success) {
                toast.success(t('instance_delete_success'));
            } else {
                toast.error(t('instance_delete_failed'));
                loadInstances(); 
            }
        } catch (error) {
            toast.error(t('error_occurred'));
            loadInstances();
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            const newInstance = await window.api?.instancesDuplicate?.(id);
            if (newInstance) {
                toast.success(t('instance_created_success'));
                loadInstances();
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleUpdate = async (id: string, updates: Partial<GameInstance>) => {
        setInstances(prev => prev.map(inst =>
            inst.id === id ? { ...inst, ...updates } : inst
        ));
        if (selectedInstance?.id === id && setSelectedInstance) {
             (setSelectedInstance as any)((prev: any) => prev ? { ...prev, ...updates } : prev);
        }
        try {
            const success = await window.api?.instancesUpdate?.(id, updates);
            if (success) {
                setInstances(prev => prev.map(inst => inst.id === id ? success : inst));
                if (selectedInstance?.id === id && setSelectedInstance) (setSelectedInstance as any)(success);
            } else {
                const freshInstances = await window.api?.instancesList?.();
                if (freshInstances) setInstances(freshInstances);
                toast.error(t('save_failed'));
            }
        } catch (error) {
            const freshInstances = await window.api?.instancesList?.();
            if (freshInstances) setInstances(freshInstances);
            toast.error(t('save_failed'));
        }
    };

    const handleOpenFolder = async (id: string) => {
        await window.api?.instancesOpenFolder?.(id);
    };

    return {
        instances,
        isLoading,
        playingInstances,
        joinedServers,
        loadingServers,
        loadInstances,
        loadJoinedServers,
        handleDelete,
        handleDuplicate,
        handleUpdate,
        handleOpenFolder,
        setInstances,
        setPlayingInstances
    };
}
