import React, { useEffect, useRef, useState } from "react";

interface SkinPreview3DProps {
    skinUrl: string | null;
    variant: "classic" | "slim";
    backgroundColor?: string;
    width?: string | number;
    height?: string | number;
    onResetRotation?: (resetFn: () => void) => void;
    onSkinLoadStateChange?: (loading: boolean) => void;
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

    // A tiny generated classic skin keeps the 3D preview visible even if remote skin URLs fail.
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
    onSkinLoadStateChange
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewerRef = useRef<any | null>(null);
    const dragRef = useRef({
        active: false,
        startX: 0,
        startRotation: FALLBACK_ROTATION,
    });

    const [rotationY, setRotationY] = useState(FALLBACK_ROTATION);
    const [viewerReady, setViewerReady] = useState(false);

    // Expose reset rotation capability
    useEffect(() => {
        if (onResetRotation) {
            onResetRotation(() => setRotationY(FALLBACK_ROTATION));
        }
    }, [onResetRotation]);

    // Calculate zoom based on container height so the character does not disappear in large cards.
    const calcZoom = (h: number) => Math.min(0.95, Math.max(0.45, h / 620));

    // Initialize Viewer
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
                    enableControls: false,
                    animation: new IdleAnimation(),
                    background: backgroundColor,
                });

                viewer.controls.enabled = false;
                viewer.autoRotate = false;
                viewer.playerObject.rotation.y = rotationY;
                viewerRef.current = viewer;
                setViewerReady(true);

                resizeObserver = new ResizeObserver(() => {
                    const container = containerRef.current;
                    if (!container || !viewerRef.current) return;
                    const w = container.clientWidth;
                    const h = container.clientHeight;
                    viewerRef.current.setSize(w, h);
                    viewerRef.current.zoom = calcZoom(h);
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

    // Sync Rotation
    useEffect(() => {
        if (!viewerRef.current) return;
        viewerRef.current.playerObject.rotation.y = rotationY;
    }, [rotationY]);

    // Sync Skin & Variant
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

        // Hide player during load to prevent flash of wrong arm variant
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

    // Drag Logic
    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        dragRef.current.active = true;
        dragRef.current.startX = event.clientX;
        dragRef.current.startRotation = rotationY;
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current.active) return;
        const deltaX = event.clientX - dragRef.current.startX;
        const nextRotation = dragRef.current.startRotation + deltaX * 0.01;
        setRotationY(nextRotation);
    };

    const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div
            ref={containerRef}
            className="relative overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none"
            style={{ width, height, backgroundColor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onPointerLeave={stopDragging}
        >
            <canvas ref={canvasRef} className="block w-full h-full" style={{ backgroundColor: "transparent" }} />
        </div>
    );
};
