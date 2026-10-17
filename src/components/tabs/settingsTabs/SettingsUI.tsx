import type { ReactNode } from "react";

/**
 * Shared building blocks for the settings tabs, so every tab has the same
 * rhythm: a page title, grouped sections, and one rounded card per setting
 * with a readable title/description on the left and its control on the right.
 */

type Colors = any;

export function SettingsPage({ title, description, colors, children }: {
    title: string;
    description?: string;
    colors: Colors;
    children: ReactNode;
}) {
    return (
        <div className="space-y-8 pb-4">
            <header>
                <h3 className="font-display text-2xl" style={{ color: colors.onSurface }}>{title}</h3>
                {description && (
                    <p className="text-[15px] mt-1.5" style={{ color: colors.onSurfaceVariant }}>{description}</p>
                )}
            </header>
            {children}
        </div>
    );
}

export function SettingsSection({ title, description, colors, action, children }: {
    title?: string;
    description?: string;
    colors: Colors;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section>
            {(title || action) && (
                <div className="flex items-end justify-between gap-4 mb-3 px-1">
                    <div>
                        {title && <h4 className="text-base font-bold" style={{ color: colors.onSurface }}>{title}</h4>}
                        {description && <p className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant }}>{description}</p>}
                    </div>
                    {action}
                </div>
            )}
            <div className="space-y-2.5">{children}</div>
        </section>
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
    return (
        <div
            className="rounded-xl px-5 py-4"
            style={{ backgroundColor: danger ? "rgba(239,68,68,0.08)" : colors.surfaceContainer }}
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
        </div>
    );
}

export function Toggle({ checked, onChange, colors, disabled, label }: {
    checked: boolean;
    onChange: (next: boolean) => void;
    colors: Colors;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className="relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: checked ? colors.secondary : colors.outline }}
        >
            <span
                className="absolute top-1 left-1 w-5 h-5 rounded-full shadow transition-transform duration-200"
                style={{ transform: checked ? "translateX(20px)" : "translateX(0)", backgroundColor: checked ? "#111" : "#fff" }}
            />
        </button>
    );
}

/** Pill group for picking one of a few options. */
export function Segmented<V extends string>({ value, options, onChange, colors }: {
    value: V;
    options: { value: V; label: ReactNode }[];
    onChange: (value: V) => void;
    colors: Colors;
}) {
    return (
        <div className="inline-flex p-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className="h-9 px-4 rounded-md text-sm font-semibold transition-colors whitespace-nowrap"
                        style={active ? { backgroundColor: colors.secondary, color: "#111" } : { color: colors.onSurfaceVariant }}
                    >
                        {option.label}
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
export const buttonClass = "h-10 px-4 rounded-lg border text-sm font-semibold transition hover:brightness-110 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50";
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
