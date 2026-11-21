import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "./Icons";

interface ScrollStripProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Scroll axis. Horizontal shows ‹ ›, vertical shows ˄ ˅. */
    orientation?: "horizontal" | "vertical";
    /** Classes for the scrolling element (layout of the items: flex, gap, padding...). */
    viewportClassName?: string;
    /** Classes for the arrow buttons (size/colour); sensible dark-glass default. */
    arrowClassName?: string;
    /** Share of the visible length one arrow click scrolls. */
    step?: number;
    children: React.ReactNode;
}

/**
 * A scrolling strip with arrow buttons that appear only while there is more to see in that
 * direction. The scrollbar is hidden; wheel/drag/keyboard scrolling still work.
 */
export function ScrollStrip({
    orientation = "horizontal",
    viewportClassName = "",
    arrowClassName = "w-8 h-8 bg-black/60 text-white backdrop-blur-md hover:bg-black/80",
    step = 0.8,
    className = "",
    children,
    ...rest
}: ScrollStripProps) {
    const vertical = orientation === "vertical";
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const [edges, setEdges] = React.useState({ start: false, end: false });

    const update = React.useCallback(() => {
        const el = viewportRef.current;
        if (!el) return;
        const pos = vertical ? el.scrollTop : el.scrollLeft;
        const max = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
        const next = { start: pos > 2, end: pos < max - 2 };
        setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    }, [vertical]);

    React.useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        for (const child of Array.from(el.children)) ro.observe(child);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    });

    const scrollBy = (dir: -1 | 1) => {
        const el = viewportRef.current;
        if (!el) return;
        const amount = (vertical ? el.clientHeight : el.clientWidth) * step * dir;
        el.scrollBy(vertical ? { top: amount, behavior: "smooth" } : { left: amount, behavior: "smooth" });
    };

    const arrow = (dir: -1 | 1) => {
        const show = dir === -1 ? edges.start : edges.end;
        const place = vertical
            ? `left-1/2 -translate-x-1/2 ${dir === -1 ? "top-0" : "bottom-0"}`
            : `top-1/2 -translate-y-1/2 ${dir === -1 ? "left-1" : "right-1"}`;
        const Icon = dir === -1 ? Icons.ChevronLeft : Icons.ChevronRight;
        return (
            <AnimatePresence>
                {show && (
                    <motion.button
                        key={dir}
                        type="button"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => { e.stopPropagation(); scrollBy(dir); }}
                        aria-label={dir === -1 ? "Previous" : "Next"}
                        className={`absolute z-10 ${place} flex items-center justify-center rounded-full shadow-lg transition-colors ${arrowClassName}`}
                    >
                        <Icon className={`w-4 h-4 ${vertical ? "rotate-90" : ""}`} />
                    </motion.button>
                )}
            </AnimatePresence>
        );
    };

    return (
        <div className={`relative ${className}`} {...rest}>
            <div
                ref={viewportRef}
                className={`${vertical ? "overflow-y-auto overflow-x-hidden" : "overflow-x-auto overflow-y-hidden"} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${viewportClassName}`}
            >
                {children}
            </div>
            {arrow(-1)}
            {arrow(1)}
        </div>
    );
}
