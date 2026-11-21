import React from "react";
import { motion } from "framer-motion";
import { playClick } from "../../../lib/sounds";
import { useMotionPreset } from "../../../lib/motion";

interface FilterPopoverItemProps {
    colors: any;
    active: boolean;
    accent?: string;
    onClick: () => void;
    children: React.ReactNode;
    icon?: React.ReactNode;
    /** Single-choice groups: the active highlight slides between items sharing this id. */
    layoutId?: string;
}

export function FilterPopoverItem({ colors, active, accent, onClick, children, icon, layoutId }: FilterPopoverItemProps) {
    const tint = accent || colors.secondary;
    const m = useMotionPreset();
    return (
        <button
            type="button"
            onClick={() => { playClick(); onClick(); }}
            className="relative isolate flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors text-left w-full hover:bg-black/5"
            style={{
                
                
                color: colors.onSurface,
                backgroundColor: active && !layoutId ? tint + "22" : "transparent",
                fontWeight: active ? 700 : 500,
            }}
        >
            {active && layoutId && (
                <motion.span
                    layoutId={layoutId}
                    transition={m.tabIndicator}
                    className="absolute inset-0 -z-10 rounded-lg"
                    style={{ backgroundColor: tint + "22" }}
                />
            )}
            {icon ? <span className="w-4 flex items-center justify-center shrink-0">{icon}</span> : <span className="w-4" />}
            <span className="flex-1 truncate">{children}</span>
            {active && (
                <motion.i variants={m.scaleIn} initial="hidden" animate="show" className="fa-solid fa-check text-[10px]" style={{ color: tint }} />
            )}
        </button>
    );
}
