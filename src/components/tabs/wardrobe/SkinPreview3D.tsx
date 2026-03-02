import React, { useEffect, useRef, useState } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";

interface SkinPreview3DProps {
    skinUrl: string | null;
    variant: "classic" | "slim";
    width?: string | number;
    height?: string | number;
    onResetRotation?: (resetFn: () => void) => void;
    onSkinLoadStateChange?: (loading: boolean) => void;
}

const FALLBACK_ROTATION = 0;

export const SkinPreview3D: React.FC<SkinPreview3DProps> = ({ 
    skinUrl, 
    variant, 
    width = "100%", 
    height = "100%",
    onResetRotation,
    onSkinLoadStateChange
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewerRef = useRef<SkinViewer | null>(null);
    const dragRef = useRef({
        active: false,
        startX: 0,
        startRotation: FALLBACK_ROTATION,
    });

    const [rotationY, setRotationY] = useState(FALLBACK_ROTATION);


    // Expose reset rotation capability
    useEffect(() => {
        if (onResetRotation) {
            onResetRotation(() => setRotationY(FALLBACK_ROTATION));
        }
    }, [onResetRotation]);

    // Calculate zoom based on container height - Increased for a more prominent view
    const calcZoom = (h: number) => Math.min(0.85, Math.max(0.3, h / 650));

    // Initialize Viewer
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

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
            background: "transparent",
        });

        viewer.controls.enabled = false;
        viewer.autoRotate = false;
        viewer.playerObject.rotation.y = rotationY;
        viewerRef.current = viewer;

        const resizeObserver = new ResizeObserver(() => {
            const container = containerRef.current;
            if (!container || !viewerRef.current) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            viewerRef.current.setSize(w, h);
            viewerRef.current.zoom = calcZoom(h);
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            viewer.dispose();
            viewerRef.current = null;
        };
    }, []);

    // Sync Rotation
    useEffect(() => {
        if (!viewerRef.current) return;
        viewerRef.current.playerObject.rotation.y = rotationY;
    }, [rotationY]);

    // Sync Skin & Variant
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        if (!skinUrl) {
            viewer.loadSkin(null);
            onSkinLoadStateChange?.(false);
            return;
        }

        // Hide player during load to prevent flash of wrong arm variant
        viewer.playerObject.visible = false;
        onSkinLoadStateChange?.(true);
        viewer
            .loadSkin(skinUrl, {
                model: variant === "slim" ? "slim" : "default",
            })
            .then(() => {
                viewer.playerObject.visible = true;
                onSkinLoadStateChange?.(false);
            })
            .catch((e) => {
                console.error("Failed to load skin preview", e);
                viewer.playerObject.visible = true;
                onSkinLoadStateChange?.(false);
            });
    }, [skinUrl, variant, onSkinLoadStateChange]);

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
            style={{ width, height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onPointerLeave={stopDragging}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
};
