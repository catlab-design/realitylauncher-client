import React, { useEffect, useRef, useState } from "react";
import elytraAssetUrl from "../../../assets/elytra.png";

interface SkinPreview3DProps {
    skinUrl: string | null;
    variant: "classic" | "slim";
    backgroundColor?: string;
    width?: string | number;
    height?: string | number;
    onResetRotation?: (resetFn: () => void) => void;
    onSkinLoadStateChange?: (loading: boolean) => void;
    animationType?: "idle" | "walk" | "run" | "fly";
}

const FALLBACK_ROTATION = 0;

let skinViewerModulePromise: Promise<any> | null = null;
let fallbackSkinDataUrl: string | null = null;

function loadSkinViewerModule() {
    if (!skinViewerModulePromise) {
        skinViewerModulePromise = import("skinview3d");
    }
    return skinViewerModulePromise;
}

function getFallbackSkinDataUrl(): string | null {
    if (fallbackSkinDataUrl || typeof document === "undefined") {
        return fallbackSkinDataUrl;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);

    const fill = (color: string, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    };

    
    fill("#c68642", 0, 0, 64, 64);
    fill("#f1c27d", 0, 0, 32, 16);
    fill("#2563eb", 16, 16, 24, 16);
    fill("#1f2937", 0, 16, 16, 16);
    fill("#f1c27d", 40, 16, 16, 16);
    fill("#1f2937", 16, 48, 16, 16);
    fill("#f1c27d", 32, 48, 16, 16);
    fill("#3f2a1d", 8, 0, 24, 8);
    fill("#111827", 16, 11, 2, 2);
    fill("#111827", 24, 11, 2, 2);

    fallbackSkinDataUrl = canvas.toDataURL("image/png");
    return fallbackSkinDataUrl;
}

export const SkinPreview3D: React.FC<SkinPreview3DProps> = ({ 
    skinUrl, 
    variant, 
    backgroundColor = "#242424",
    width = "100%", 
    height = "100%",
    onResetRotation,
    onSkinLoadStateChange,
    animationType = "idle"
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewerRef = useRef<any | null>(null);
    const [viewerReady, setViewerReady] = useState(false);

    
    useEffect(() => {
        if (onResetRotation) {
            onResetRotation(() => {
                const viewer = viewerRef.current;
                if (viewer) {
                    viewer.controls.reset();
                    viewer.playerObject.rotation.set(0, FALLBACK_ROTATION, 0);
                }
            });
        }
    }, [onResetRotation]);

    
    const calcZoom = (h: number) => Math.min(0.95, Math.max(0.45, h / 620));

    useEffect(() => {
        let cancelled = false;
        let resizeObserver: ResizeObserver | null = null;

        const initViewer = async () => {
            if (!canvasRef.current || !containerRef.current) return;

            try {
                const { IdleAnimation, SkinViewer } = await loadSkinViewerModule();
                if (cancelled || !canvasRef.current || !containerRef.current) return;

                const cw = containerRef.current.clientWidth;
                const ch = containerRef.current.clientHeight;

                const viewer = new SkinViewer({
                    canvas: canvasRef.current,
                    width: cw,
                    height: ch,
                    zoom: calcZoom(ch),
                    fov: 60,
                    enableControls: true,
                    animation: new IdleAnimation(),
                    background: backgroundColor === "transparent" ? undefined : backgroundColor,
                });

                viewer.controls.enableZoom = true;
                viewer.controls.enablePan = false;
                viewer.autoRotate = false;
                viewerRef.current = viewer;
                setViewerReady(true);

                let firstResize = true;
                resizeObserver = new ResizeObserver(() => {
                    const container = containerRef.current;
                    if (!container || !viewerRef.current) return;
                    const w = container.clientWidth;
                    const h = container.clientHeight;
                    viewerRef.current.setSize(w, h);
                    viewerRef.current.zoom = calcZoom(h);
                    if (firstResize && viewerRef.current.controls) {
                        viewerRef.current.controls.saveState();
                        firstResize = false;
                    }
                });
                resizeObserver.observe(containerRef.current);
            } catch (error) {
                console.error("Failed to initialize skin viewer", error);
                onSkinLoadStateChange?.(false);
            }
        };

        void initViewer();

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            const viewer = viewerRef.current;
            viewerRef.current = null;
            viewer?.dispose?.();
        };
    }, [backgroundColor, onSkinLoadStateChange]);

    
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        let cancelled = false;

        const syncAnim = async () => {
            const modules = await loadSkinViewerModule();
            if (cancelled) return;

            viewer.animation = null;

            let animInstance: any = null;
            if (animationType === "walk") {
                animInstance = new modules.WalkingAnimation();
            } else if (animationType === "run") {
                animInstance = new modules.RunningAnimation();
            } else if (animationType === "fly") {
                animInstance = new modules.FlyingAnimation();
            } else {
                animInstance = new modules.IdleAnimation();
            }

            viewer.animation = animInstance;
        };

        void syncAnim();

    }, [animationType, viewerReady]);

    
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        if (animationType === "fly") {
            viewer.loadCape(elytraAssetUrl, { backEquipment: "elytra" });
        } else {
            viewer.loadCape(null);
        }
    }, [animationType, viewerReady]);

    
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !viewerReady) return;

        const fallbackSkin = getFallbackSkinDataUrl();
        const source = skinUrl || fallbackSkin;

        if (!source) {
            viewer.loadSkin(null);
            onSkinLoadStateChange?.(false);
            return;
        }

        
        viewer.playerObject.visible = false;
        onSkinLoadStateChange?.(true);
        viewer
            .loadSkin(source, {
                model: variant === "slim" ? "slim" : "default",
            })
            .then(() => {
                viewer.playerObject.visible = true;
                onSkinLoadStateChange?.(false);
            })
            .catch((error: unknown) => {
                console.error("Failed to load skin preview", error);
                if (fallbackSkin && source !== fallbackSkin) {
                    void viewer
                        .loadSkin(fallbackSkin, {
                            model: variant === "slim" ? "slim" : "default",
                        })
                        .finally(() => {
                            viewer.playerObject.visible = true;
                            onSkinLoadStateChange?.(false);
                        });
                    return;
                }

                viewer.playerObject.visible = true;
                onSkinLoadStateChange?.(false);
            });
    }, [skinUrl, variant, viewerReady, onSkinLoadStateChange]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden touch-none select-none"
            style={{ width, height, backgroundColor }}
        >
            <canvas ref={canvasRef} className="block w-full h-full" style={{ backgroundColor: "transparent" }} />
        </div>
    );
};
