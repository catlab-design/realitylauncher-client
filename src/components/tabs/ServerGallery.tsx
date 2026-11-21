import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../ui/Icons";
import { ScrollStrip } from "../ui/ScrollStrip";
import { playClick } from "../../lib/sounds";
import { useMotionPreset } from "../../lib/motion";
import type { GalleryImage } from "./ServerItem";

/** Keep only well-formed entries (the payload comes straight from the API). */
export function normalizeGallery(raw: unknown): GalleryImage[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (item): item is GalleryImage =>
            !!item && typeof item === "object" && typeof (item as any).id === "string" && typeof (item as any).url === "string",
    );
}

interface ServerGalleryStripProps {
    images: GalleryImage[];
    onOpen: (index: number) => void;
    t: (key: any) => string;
    className?: string;
}

/**
 * Horizontal thumbnail strip. Image URLs are immutable per image id, so they are
 * used as-is (no timestamp cache-busting) and stay in the HTTP cache.
 */
export function ServerGalleryStrip({ images, onOpen, t, className = "" }: ServerGalleryStripProps) {
    const m = useMotionPreset();
    if (images.length === 0) return null;

    return (
        <div className={className}>
            <div className="flex items-center justify-end gap-2 mb-2 text-sm font-semibold text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                </svg>
                {t("gallery")}
                <span className="tabular-nums text-white/60">{images.length}</span>
            </div>
            <ScrollStrip
                // Padding (cancelled by the negative margin) keeps the hover ring/lift inside the scroll clip.
                viewportClassName="flex gap-2.5 -m-2 p-2 scroll-px-2 snap-x snap-mandatory"
                role="list"
                aria-label={t("gallery")}
            >
                {images.map((image, index) => (
                    <motion.button
                        key={image.id}
                        type="button"
                        role="listitem"
                        custom={index}
                        variants={m.showcaseItem}
                        initial="hidden"
                        animate="show"
                        onClick={(e) => { e.stopPropagation(); playClick(); onOpen(index); }}
                        aria-label={image.caption || `${t("server_gallery_view")} ${index + 1}`}
                        className="pressable relative h-24 aspect-video shrink-0 snap-start rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/15 shadow-lg transition hover:ring-2 hover:ring-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffde59]"
                    >
                        <img
                            src={image.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    </motion.button>
                ))}
            </ScrollStrip>
        </div>
    );
}

interface GalleryLightboxProps {
    images: GalleryImage[];
    /** Open image index, or null when closed. */
    index: number | null;
    onIndexChange: (index: number) => void;
    onClose: () => void;
    t: (key: any) => string;
}

/** Fullscreen viewer: ‹ › arrows, ←/→ keys, Esc to close, counter + caption. */
export function GalleryLightbox({ images, index, onIndexChange, onClose, t }: GalleryLightboxProps) {
    const m = useMotionPreset();
    const open = index !== null && images.length > 0;
    const current = open ? Math.min(Math.max(index, 0), images.length - 1) : 0;
    const image = open ? images[current] : null;
    const count = images.length;

    const go = React.useCallback(
        (delta: number) => {
            if (index === null || count < 2) return;
            onIndexChange((current + delta + count) % count);
        },
        [index, count, current, onIndexChange],
    );

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                go(1);
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                go(-1);
            }
        };
        // Capture so Esc closes the viewer before anything underneath reacts.
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, go, onClose]);

    // Warm the neighbours so arrowing through feels instant.
    React.useEffect(() => {
        if (!open || count < 2) return;
        for (const offset of [1, -1]) {
            const neighbour = images[(current + offset + count) % count];
            if (neighbour) {
                const img = new Image();
                img.decoding = "async";
                img.src = neighbour.url;
            }
        }
    }, [open, current, count, images]);

    const arrow = "pressable absolute top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20";

    return createPortal(
        <AnimatePresence>
            {open && image && (
                <motion.div
                    key="server-gallery-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t("gallery")}
                    className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm select-none"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    variants={m.modal.backdrop}
                    {...m.states}
                >
                    <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-4 px-6 pt-12 pb-4">
                        <span className="h-9 px-3.5 rounded-full flex items-center text-sm font-semibold tabular-nums text-white bg-white/10">
                            {current + 1} / {count}
                        </span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onClose(); }}
                            aria-label={t("close")}
                            title={t("close")}
                            className="pressable w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white transition hover:bg-white/20"
                        >
                            <Icons.X className="w-5 h-5" />
                        </button>
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                        <motion.img
                            key={image.id}
                            src={image.url}
                            alt={image.caption || ""}
                            draggable={false}
                            variants={m.scaleIn}
                            initial="hidden"
                            animate="show"
                            exit="exit"
                            onClick={(e) => e.stopPropagation()}
                            className="max-w-[calc(100vw-10rem)] max-h-[calc(100vh-11rem)] object-contain rounded-xl shadow-2xl"
                        />
                    </AnimatePresence>

                    {image.caption && (
                        <p
                            className="mt-4 max-w-[min(48rem,calc(100vw-10rem))] text-center text-base text-white/85 line-clamp-2"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {image.caption}
                        </p>
                    )}

                    {count > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); go(-1); }}
                                aria-label={t("previous")}
                                title={t("previous")}
                                className={`${arrow} left-6`}
                            >
                                <Icons.ChevronLeft className="w-7 h-7" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); go(1); }}
                                aria-label={t("next")}
                                title={t("next")}
                                className={`${arrow} right-6`}
                            >
                                <Icons.ChevronRight className="w-7 h-7" />
                            </button>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
