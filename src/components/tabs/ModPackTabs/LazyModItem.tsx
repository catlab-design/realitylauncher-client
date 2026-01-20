/**
 * LazyModItem - Component แสดง mod item พร้อม lazy load metadata
 */

import React, { useEffect, useState, useRef } from "react";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";

export interface ModInfo {
    filename: string;
    name: string;
    displayName: string;
    author: string;
    description: string;
    icon: string | null;
    enabled: boolean;
    size: number;
    modifiedAt: string;
}

export interface LazyModItemProps {
    mod: ModInfo;
    instanceId: string;
    colors: any;
    formatSize: (bytes: number) => string;
    onToggle: (filename: string) => void;
    onDelete: (filename: string) => void;
    isLocked?: boolean;
    onToggleLock?: (filename: string) => void;
    isServerManaged?: boolean;
    index?: number;
}

// Queue to limit concurrent metadata requests (balanced for performance)
class MetadataQueue {
    private queue: (() => Promise<void>)[] = [];
    private running = 0;
    private maxConcurrent = 8; // Increased for faster loading

    add(task: () => Promise<void>) {
        this.queue.push(task);
        this.process();
    }

    async process() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

        this.running++;
        const task = this.queue.shift();

        try {
            if (task) await task();
        } finally {
            this.running--;
            this.process();
        }
    }
}

const metadataQueue = new MetadataQueue();

export function LazyModItem({ mod, instanceId, colors, formatSize, onToggle, onDelete, isLocked, onToggleLock, isServerManaged, index = 0 }: LazyModItemProps) {
    // Safety check for undefined mod (can happen during loading skeleton states if rendered prematurely)
    if (!mod) return null;

    const [metadata, setMetadata] = useState<{
        displayName?: string | null;
        author?: string | null;
        icon?: string | null;
        loaded: boolean;
    }>({ loaded: false });

    const itemRef = useRef<HTMLDivElement>(null);
    const loadedRef = useRef(false);

    useEffect(() => {
        // Skip if already has metadata from parent mod object
        if (mod.icon || (mod.displayName !== mod.name)) {
            setMetadata({
                displayName: mod.displayName,
                author: mod.author,
                icon: mod.icon,
                loaded: true
            });
            loadedRef.current = true;
            return;
        }

        // If for some reason we already loaded it
        if (loadedRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                if (entry.isIntersecting && !loadedRef.current) {
                    // Queue the request instead of firing immediately
                    metadataQueue.add(async () => {
                        // Double check if already loaded (might have been processed while in queue)
                        if (loadedRef.current) return;

                        // Check visibility again? 
                        // Actually, if user scrolls away fast, we might still fetch. 
                        // But queue prevents flooding.

                        loadedRef.current = true;
                        try {
                            const result = await (window.api as any)?.instanceGetModMetadata?.(instanceId, mod.filename);
                            if (result?.ok && result.metadata) {
                                setMetadata({
                                    displayName: result.metadata.displayName,
                                    author: result.metadata.author,
                                    icon: result.metadata.icon,
                                    loaded: true,
                                });
                            } else {
                                setMetadata({ loaded: true });
                            }
                        } catch (error) {
                            console.error("[LazyModItem] Failed to load metadata:", error);
                            setMetadata({ loaded: true });
                        }
                    });

                    // Stop observing once queued
                    observer.disconnect();
                }
            },
            { threshold: 0.1, rootMargin: "200px" } // Increased rootMargin for earlier loading
        );

        // Start observing immediately (no delay)
        if (itemRef.current) observer.observe(itemRef.current);

        return () => observer.disconnect();
    }, [instanceId, mod.filename]);

    const displayName = metadata.loaded ? (metadata.displayName || mod.name) : mod.displayName;
    const author = metadata.loaded ? (metadata.author || "") : mod.author;
    const icon = metadata.loaded ? metadata.icon : mod.icon;

    return (
        <div
            ref={itemRef}
            className="flex items-center gap-4 p-4 rounded-xl transition-all"
            style={{
                backgroundColor: colors.surfaceContainer,
                opacity: mod.enabled ? 1 : 0.6
            }}
        >
            {/* Mod icon */}
            {icon ? (
                <img
                    src={icon}
                    alt={displayName}
                    className="w-10 h-10 rounded-lg object-cover"
                />
            ) : (
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                </div>
            )}

            {/* Mod info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                        {displayName}
                    </p>
                    {isLocked && (
                        Icons?.Lock && <Icons.Lock className="w-3 h-3" style={{ color: colors.secondary }} />
                    )}
                </div>
                <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                    {author ? `by ${author} • ` : ""}{formatSize(mod.size)}
                </p>
            </div>

            {/* Lock button */}
            {onToggleLock && (
                <button
                    onClick={() => { playClick(); onToggleLock(mod.filename); }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                    style={{
                        color: isLocked ? colors.secondary : colors.onSurfaceVariant,
                        backgroundColor: isLocked ? colors.secondary + "20" : "transparent"
                    }}
                    title={isLocked ? "ปลดล็อค (จะถูกลบเมื่อ Sync)" : "ล็อค (ป้องกันการลบเมื่อ Sync)"}
                >
                    {isLocked ? (Icons?.Lock ? <Icons.Lock className="w-5 h-5" /> : "L") : (Icons?.Unlock ? <Icons.Unlock className="w-5 h-5" /> : "U")}
                </button>
            )}

            {/* Toggle switch */}
            <button
                onClick={() => { playClick(); onToggle(mod.filename); }}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ backgroundColor: mod.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                title={mod.enabled ? "ปิด Mod" : "เปิด Mod"}
            >
                <div
                    className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                    style={{ left: mod.enabled ? "calc(100% - 20px)" : "4px" }}
                />
            </button>

            {/* Delete button */}
            <button
                onClick={() => { playClick(); onDelete(mod.filename); }}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                style={{ color: "#ef4444", opacity: isLocked ? 0.5 : 1, cursor: isLocked ? "not-allowed" : "pointer" }}
                disabled={isLocked}
                title={isLocked ? "ไม่สามารถลบได้ (Locked)" : "ลบ Mod"}
            >
                <Icons.Trash className="w-5 h-5" />
            </button>
        </div>
    );
}
