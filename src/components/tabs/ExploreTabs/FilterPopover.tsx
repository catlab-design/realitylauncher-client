// ========================================
// FilterPopoverItem — a single row used inside FilterMenu sections.
// Centralises active/inactive styling so each section doesn't repeat the same Tailwind.
// ========================================

import React from "react";
import { playClick } from "../../../lib/sounds";

interface FilterPopoverItemProps {
    colors: any;
    active: boolean;
    /** Optional accent colour. Defaults to colors.secondary. */
    accent?: string;
    onClick: () => void;
    children: React.ReactNode;
    icon?: React.ReactNode;
}

export function FilterPopoverItem({ colors, active, accent, onClick, children, icon }: FilterPopoverItemProps) {
    const tint = accent || colors.secondary;
    return (
        <button
            type="button"
            onClick={() => { playClick(); onClick(); }}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors text-left w-full hover:bg-black/5"
            style={{
                // Keep label in onSurface for readable contrast on every theme. Active state is
                // signalled by the tinted background and the trailing check icon.
                color: colors.onSurface,
                backgroundColor: active ? tint + "22" : "transparent",
                fontWeight: active ? 700 : 500,
            }}
        >
            {icon ? <span className="w-4 flex items-center justify-center shrink-0">{icon}</span> : <span className="w-4" />}
            <span className="flex-1 truncate">{children}</span>
            {active && <i className="fa-solid fa-check text-[10px]" style={{ color: tint }} />}
        </button>
    );
}
