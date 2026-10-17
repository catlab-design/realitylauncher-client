import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { SPRING, useMotionPreset } from "../../../lib/motion";

/**
 * Shared building blocks for the settings tabs, so every tab has the same
 * rhythm: a page title, grouped sections, and one rounded card per setting
 * with a readable title/description on the left and its control on the right.
 *
 * Motion: when a section mounts, the page staggers its blocks and each section
 * staggers its rows (fade + 8px rise). Sections themselves don't move, so rows
 * never stack two offsets. Everything is quick and reduced-motion aware.
 */

type Colors = any;

export function SettingsPage({ title, description, colors, children }: {
    title: string;
    description?: string;
    colors: Colors;
    children: ReactNode;
}) {
    const m = useMotionPreset();
    return (
        <motion.div className="space-y-8 pb-4" variants={m.staggerContainer(0.05)} initial="hidden" animate="show">
            <motion.header variants={m.fadeUp}>
                <h3 className="font-display text-2xl" style={{ color: colors.onSurface }}>{title}</h3>
                {description && (
                    <p className="text-[15px] mt-1.5" style={{ color: colors.onSurfaceVariant }}>{description}</p>
                )}
            </motion.header>
            {children}
        </motion.div>
    );
}

export function SettingsSection({ title, description, colors, action, children }: {
    title?: string;
    description?: string;
    colors: Colors;
    action?: ReactNode;
    children: ReactNode;
}) {
    const m = useMotionPreset();
    return (
        <motion.section variants={m.staggerContainer(0.03)}>
            {(title || action) && (
                <motion.div variants={m.fadeUp} className="flex items-end justify-between gap-4 mb-3 px-1">
                    <div>
                        {title && <h4 className="text-base font-bold" style={{ color: colors.onSurface }}>{title}</h4>}
                        {description && <p className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant }}>{description}</p>}
                    </div>
                    {action}
                </motion.div>
            )}
            <div className="space-y-2.5">{children}</div>
        </motion.section>
    );
}

/** A setting card. `children` is the control on the right; `below` renders full width under the text. */
export function SettingsRow({ title, description, colors, children, below, danger, icon }: {
    title: ReactNode;
    description?: ReactNode;
    colors: Colors;
    children?: ReactNode;
    below?: ReactNode;
    danger?: boolean;
    icon?: ReactNode;
}) {
    const m = useMotionPreset();
    return (
        <motion.div
            className="rounded-xl px-5 py-4"
            style={{ backgroundColor: danger ? "rgba(239,68,68,0.08)" : colors.surfaceContainer }}
            variants={m.fadeUp}
        >
            <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-3.5 min-w-0">
                    {icon && (
                        <div
                            className="w-7 flex items-center justify-center shrink-0 text-xl"
                            style={{ color: danger ? "#ef4444" : colors.onSurface }}
                        >
                            {icon}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-base font-semibold leading-snug" style={{ color: danger ? "#ef4444" : colors.onSurface }}>{title}</p>
                        {description && (
                            <p className="text-sm leading-relaxed mt-0.5" style={{ color: colors.onSurfaceVariant }}>{description}</p>
                        )}
                    </div>
                </div>
                {children && <div className="shrink-0 flex items-center gap-2">{children}</div>}
            </div>
            {below && <div className="mt-4">{below}</div>}
        </motion.div>
    );
}

export function Toggle({ checked, onChange, colors, disabled, label }: {
    checked: boolean;
    onChange: (next: boolean) => void;
    colors: Colors;
    disabled?: boolean;
    label?: string;
}) {
    const m = useMotionPreset();
    return (
        <motion.button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className="relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: checked ? colors.secondary : colors.outline }}
            whileTap={disabled ? undefined : m.pressable.whileTap}
        >
            {/* Spring thumb; the slight stretch on press reads as a physical switch. */}
            <motion.span
                className="absolute top-1 left-1 w-5 h-5 rounded-full shadow transition-colors duration-200"
                style={{ backgroundColor: checked ? "#111" : "#fff" }}
                initial={false}
                animate={{ x: checked ? 20 : 0 }}
                transition={m.reduced ? { duration: 0 } : SPRING.snappy}
            />
        </motion.button>
    );
}

/** Pill group for picking one of a few options. */
export function Segmented<V extends string>({ value, options, onChange, colors }: {
    value: V;
    options: { value: V; label: ReactNode }[];
    onChange: (value: V) => void;
    colors: Colors;
}) {
    const m = useMotionPreset();
    // One sliding pill per Segmented instance (unique layoutId so groups never share it).
    const pillId = `settings-segmented-${useId()}`;
    return (
        <div className="isolate inline-flex p-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className="relative h-9 px-4 rounded-md text-sm font-semibold transition-colors whitespace-nowrap"
                        style={{ color: active ? "#111" : colors.onSurfaceVariant }}
                    >
                        {active && (
                            <motion.span
                                layoutId={pillId}
                                transition={m.tabIndicator}
                                className="absolute inset-0 z-1 rounded-md"
                                style={{ backgroundColor: colors.secondary }}
                            />
                        )}
                        <span className="relative z-2">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** Shared look for text/number inputs and selects. */
export const fieldClass = "h-11 px-4 rounded-lg border text-[15px] outline-none";
export const fieldStyle = (colors: Colors) => ({
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: "transparent",
    color: colors.onSurface,
});

/** Secondary button used inside rows (Browse, Open folder, …). */
export const buttonClass = "h-10 px-4 rounded-lg border text-sm font-semibold transition hover:brightness-110 active:scale-97 disabled:active:scale-100 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50";
export const buttonStyle = (colors: Colors) => ({
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: "transparent",
    color: colors.onSurface,
});
export const primaryButtonStyle = (colors: Colors) => ({
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
    color: "#111",
});
