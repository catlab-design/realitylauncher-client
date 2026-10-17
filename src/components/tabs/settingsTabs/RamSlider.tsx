import { useId } from "react";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../../lib/motion";

type Colors = any;

/** Preset RAM stops shared by the global Game settings and per-instance settings. */
export const RAM_PRESETS = [
    { label: "Lite", value: 2048 },
    { label: "Standard", value: 4096 },
    { label: "High", value: 8192 },
    { label: "Ultra", value: 16384 },
];

export const RAM_MIN_MB = 512;

export function formatRam(mb: number) {
    if (mb >= 1024) {
        return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
}

/** Recommended allocation for a machine with `systemRamMB`, capped at `capMB`. */
export function recommendedRamFor(systemRamMB: number, capMB: number) {
    let recommended = 4096;
    if (systemRamMB >= 32000) recommended = 16384;
    else if (systemRamMB >= 16000) recommended = 8192;
    else if (systemRamMB >= 12000) recommended = 6144;
    else if (systemRamMB >= 8000) recommended = 4096;
    else recommended = Math.max(2048, systemRamMB - 2048);
    return Math.min(recommended, capMB);
}

/**
 * One-line RAM slider: min label, track with snap ticks + handle, max label,
 * and an exact MB number input. Used by Settings → Game and instance settings
 * so the two can't drift.
 */
export function RamSlider({ value, maxRamMB, ticks, onChange, onCommit, colors, disabled, ariaLabel }: {
    value: number;
    maxRamMB: number;
    /** Stops drawn on the track; dragging near one snaps to it. */
    ticks: { label: string; value: number }[];
    /** New value: snapped when dragged, clamped to [512, maxRamMB] when typed. */
    onChange: (mb: number) => void;
    /** Called when the user finishes an interaction (slider release, input blur). */
    onCommit?: () => void;
    colors: Colors;
    disabled?: boolean;
    ariaLabel?: string;
}) {
    const span = maxRamMB - RAM_MIN_MB;
    const calculatePercentage = (mb: number) => ((mb - RAM_MIN_MB) / span) * 100;
    const visibleTicks = ticks.filter((tick, i, all) => tick.value <= maxRamMB && all.findIndex((x) => x.value === tick.value) === i);
    const snapRam = (mb: number) => {
        const near = visibleTicks.find((tick) => Math.abs(tick.value - mb) <= span * 0.015);
        return near ? near.value : mb;
    };
    const percent = Math.min(100, Math.max(0, calculatePercentage(value)));

    return (
        <div
            className={`flex items-center gap-4 transition-opacity duration-200 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
            aria-disabled={disabled || undefined}
        >
            <span className="text-sm shrink-0 tabular-nums" style={{ color: colors.onSurfaceVariant }}>{formatRam(RAM_MIN_MB)}</span>
            <div className="relative flex-1 h-8">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full transition-[width] duration-150 ease-out"
                    style={{ width: `${percent}%`, backgroundColor: colors.secondary }}
                />
                {visibleTicks.map((tick) => (
                    <span
                        key={tick.value}
                        title={`${tick.label} · ${formatRam(tick.value)}`}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-3.5 rounded-full pointer-events-none"
                        style={{
                            left: `${calculatePercentage(tick.value)}%`,
                            backgroundColor: tick.value <= value ? colors.secondary : colors.outline,
                        }}
                    />
                ))}
                <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-6 rounded-full shadow-md pointer-events-none transition-[left] duration-150 ease-out"
                    style={{ left: `${percent}%`, backgroundColor: colors.secondary }}
                />
                <input
                    type="range"
                    min={RAM_MIN_MB}
                    max={maxRamMB}
                    step={256}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(snapRam(Number(e.target.value)))}
                    onMouseUp={onCommit}
                    onTouchEnd={onCommit}
                    aria-label={ariaLabel}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    style={{ margin: 0 }}
                />
            </div>
            <span className="text-sm shrink-0 tabular-nums" style={{ color: colors.onSurfaceVariant }}>{formatRam(maxRamMB)}</span>
            <div className="h-11 px-3 rounded-lg flex items-center gap-1.5 shrink-0" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                <input
                    type="number"
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(Math.min(Math.max(RAM_MIN_MB, Number(e.target.value)), maxRamMB))}
                    onBlur={onCommit}
                    aria-label={ariaLabel}
                    className="w-16 bg-transparent text-center font-semibold text-[15px] tabular-nums focus:outline-none"
                    style={{ color: colors.onSurface }}
                />
                <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>MB</span>
            </div>
        </div>
    );
}

/**
 * Quick RAM presets (Recommended + Lite/Standard/High/Ultra) as a segmented pill row
 * with a sliding yellow indicator. Shared by Settings → Game and instance settings.
 */
export function RamPresetChips({ value, capMB, recommendedMB, recommendedLabel, onSelect, colors, disabled }: {
    value: number;
    capMB: number;
    recommendedMB: number;
    recommendedLabel: string;
    /** `recommended` is true when the Recommended chip was picked. */
    onSelect: (ramMB: number, recommended: boolean) => void;
    colors: Colors;
    disabled?: boolean;
}) {
    const m = useMotionPreset();
    const pillId = `ram-preset-${useId()}`;
    const chips = [
        { key: "recommended", value: recommendedMB, recommended: true, label: <><i className="fa-solid fa-thumbs-up mr-1.5" />{recommendedLabel}</>, hint: undefined as string | undefined },
        ...RAM_PRESETS.map((preset) => ({
            key: preset.label,
            value: Math.min(preset.value, capMB),
            recommended: false,
            label: <>{preset.label}</>,
            hint: `${preset.value / 1024} GB`,
        })),
    ];
    const activeKey = RAM_PRESETS.find((preset) => preset.value === value)?.label
        ?? (value === recommendedMB ? "recommended" : undefined);

    return (
        <div
            className={`isolate inline-flex flex-wrap p-1 rounded-lg transition-opacity duration-200 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
            style={{ backgroundColor: colors.surfaceContainerHighest }}
            aria-disabled={disabled || undefined}
        >
            {chips.map((chip) => {
                const active = chip.key === activeKey;
                return (
                    <button
                        key={chip.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelect(chip.value, chip.recommended)}
                        className="relative h-8 px-3.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap"
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
                        <span className="relative z-2">
                            {chip.label}
                            {chip.hint && <span className="ml-1.5 font-medium opacity-70">{chip.hint}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
