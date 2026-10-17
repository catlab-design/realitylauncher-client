/**
 * Shared motion presets for the launcher (framer-motion).
 *
 * One vocabulary for every page so the app moves the same way everywhere:
 * short (150-350ms), spring-y, transform/opacity only. Variant labels are
 * always `hidden` / `show` / `exit`, so presets can be mixed and nested.
 *
 * Reduced motion: the app root wraps everything in
 * `<MotionConfig reducedMotion="user">`, and `useMotionPreset()` reads that
 * same config, so a component that takes its presets from the hook gets
 * opacity-only, near-instant versions when the OS asks for less motion.
 * (To add an in-app "reduce animations" setting later, flip that MotionConfig
 * to `reducedMotion="always"` - every consumer follows automatically.)
 *
 * See the motion guide for when to use each preset.
 */
import { useMemo } from "react";
import { useReducedMotionConfig, type TargetAndTransition, type Transition, type Variants } from "framer-motion";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Cubic-bezier curves. `out` for things arriving, `in` for things leaving. */
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  in: [0.4, 0, 1, 1],
  inOut: [0.65, 0, 0.35, 1],
  emphasized: [0.2, 0, 0, 1],
} as const;

/** Durations in seconds. Exits are always shorter than entrances. */
export const DURATION = {
  instant: 0.08,
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

/** Springs. Damped enough that nothing visibly wobbles. */
export const SPRING = {
  /** Presses, hovers, small popovers. */
  snappy: { type: "spring", stiffness: 520, damping: 36, mass: 0.7 },
  /** Panels and dialogs. */
  smooth: { type: "spring", stiffness: 380, damping: 32, mass: 0.8 },
  /** Shared-layout indicators (tab underline, active pill). */
  layout: { type: "spring", stiffness: 500, damping: 40, mass: 0.8 },
  /** Toast cards sliding in from the edge. */
  toast: { type: "spring", stiffness: 420, damping: 34, mass: 0.8 },
} as const satisfies Record<string, Transition>;

/** Spread onto a motion element to drive the standard `hidden` -> `show` -> `exit` labels. */
export const MOTION_STATES = { initial: "hidden", animate: "show", exit: "exit" } as const;

const enter = (duration: number = DURATION.base): Transition => ({ duration, ease: EASE.out });
const leave = (duration: number = DURATION.fast): Transition => ({ duration, ease: EASE.in });

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: enter() },
  exit: { opacity: 0, transition: leave() },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: enter(0.26) },
  exit: { opacity: 0, y: 4, transition: leave() },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { ...SPRING.smooth, opacity: enter(DURATION.fast) } },
  exit: { opacity: 0, scale: 0.98, transition: leave() },
};

/** The side an element slides in FROM. */
export type SlideFrom = "left" | "right" | "top" | "bottom";

/** Slides in from the given side, e.g. `slideIn("right")` enters moving leftwards (drawers, next step). */
export function slideIn(from: SlideFrom = "bottom", distance = 16): Variants {
  const horizontal = from === "left" || from === "right";
  const offset = from === "left" || from === "top" ? -distance : distance;
  const at = (v: number) => (horizontal ? { x: v } : { y: v });
  return {
    hidden: { opacity: 0, ...at(offset) },
    show: { opacity: 1, ...at(0), transition: enter(0.26) },
    exit: { opacity: 0, ...at(offset / 2), transition: leave() },
  };
}

/**
 * Parent that staggers its children's `show`. Children use any preset with
 * the same labels (fadeUp, scaleIn, listItem...). Keep it for SHORT groups
 * (<= ~12 items: hero blocks, card rows, settings sections) - never a long list.
 */
export function staggerContainer(stagger = 0.04, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
    exit: { transition: { staggerChildren: 0 } },
  };
}

/** Max items that get an incremental delay in `listItem`; later ones share the last delay. */
export const LIST_STAGGER_CAP = 6;
const LIST_STAGGER_STEP = 0.03;

/**
 * Item of a SHORT grid, staggered by index: `<motion.div variants={listItem} custom={i} {...MOTION_STATES}>`.
 * Delay is capped (max ~180ms) so later cards never wait. Use EITHER `custom={i}`
 * OR a `staggerContainer` parent, not both. Not for long/virtualized lists.
 */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...enter(), delay: Math.min(Math.max(i, 0), LIST_STAGGER_CAP) * LIST_STAGGER_STEP },
  }),
  exit: { opacity: 0, transition: leave(DURATION.instant) },
};

// ---------------------------------------------------------------------------
// Showcase: slower, more cinematic entrances for hero pages (Servers, Home).
// Only for the first reveal of a page's headline content - never for lists
// the user scrolls through or for controls they are waiting on.
// ---------------------------------------------------------------------------

const SHOWCASE_DURATION = 0.6;
const showcaseEnter = (duration: number = SHOWCASE_DURATION): Transition => ({ duration, ease: EASE.emphasized });

/** Hero text block piece: rises 20px and fades in, slow and soft. */
export const showcaseUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: showcaseEnter() },
  exit: { opacity: 0, y: 6, transition: leave() },
};

/** Parent for showcase pieces: wider stagger so each line lands on its own beat. */
export function showcaseStagger(stagger = 0.09, delayChildren = 0.08): Variants {
  return staggerContainer(stagger, delayChildren);
}

/** Side panels / rails gliding in from an edge. */
export function showcaseSlide(from: SlideFrom = "left", distance = 28): Variants {
  const horizontal = from === "left" || from === "right";
  const offset = from === "left" || from === "top" ? -distance : distance;
  const at = (v: number) => (horizontal ? { x: v } : { y: v });
  return {
    hidden: { opacity: 0, ...at(offset) },
    show: { opacity: 1, ...at(0), transition: showcaseEnter(0.65) },
    exit: { opacity: 0, ...at(offset / 2), transition: leave() },
  };
}

/** Hero artwork settling in: a gentle zoom-out from 1.06 with a fade. */
export const showcaseArt: Variants = {
  hidden: { opacity: 0, scale: 1.06 },
  show: { opacity: 1, scale: 1, transition: { opacity: showcaseEnter(0.7), scale: showcaseEnter(1.2) } },
  exit: { opacity: 0, transition: leave(0.2) },
};

const SHOWCASE_LIST_CAP = 8;
const SHOWCASE_LIST_STEP = 0.07;

/** Card in a SHORT showcase grid/row, staggered by index (`custom={i}`), delay capped at 8 cards. */
export const showcaseItem: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...showcaseEnter(0.55), delay: 0.12 + Math.min(Math.max(i, 0), SHOWCASE_LIST_CAP) * SHOWCASE_LIST_STEP },
  }),
  exit: { opacity: 0, transition: leave(DURATION.instant) },
};

/**
 * Page (tab) transition used by the app shell. Fast out, soft in; ~250ms total
 * under `AnimatePresence mode="wait"`. Returns to `transform: none` at rest so
 * it never leaves a containing block for `position: fixed` children.
 */
export const page: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.995 },
  show: { opacity: 1, y: 0, scale: 1, transition: enter(0.17) },
  exit: { opacity: 0, transition: leave(DURATION.instant) },
};

/** Content swapped inside a fixed frame (settings sections, sub-tabs, steps). */
export const panelSwap: Variants = {
  hidden: { opacity: 0, x: 10 },
  show: { opacity: 1, x: 0, transition: enter(0.2) },
  exit: { opacity: 0, x: -6, transition: leave(0.1) },
};

/** Modal = backdrop fade + panel spring (scale .96 -> 1, y 8 -> 0). */
export const modal: { backdrop: Variants; panel: Variants } = {
  backdrop: {
    hidden: { opacity: 0 },
    show: { opacity: 1, pointerEvents: "auto", transition: enter(0.18) },
    exit: { opacity: 0, pointerEvents: "none", transition: leave(0.16) },
  },
  panel: {
    hidden: { opacity: 0, scale: 0.96, y: 8 },
    show: { opacity: 1, scale: 1, y: 0, pointerEvents: "auto", transition: { ...SPRING.smooth, opacity: enter(0.18) } },
    exit: { opacity: 0, scale: 0.98, y: 4, pointerEvents: "none", transition: leave(0.14) },
  },
};

/** Where the popover sits relative to its trigger; it grows out of the opposite corner. */
export type PopoverPlacement = "bottom-start" | "bottom-end" | "bottom" | "top-start" | "top-end" | "top";

const popoverCache = new Map<PopoverPlacement, Variants>();

/** Dropdowns, menus, inbox panels: origin-aware scale + fade + small drop. */
export function popover(placement: PopoverPlacement = "bottom-end"): Variants {
  const cached = popoverCache.get(placement);
  if (cached) return cached;
  const below = placement.startsWith("bottom");
  const originX = placement.endsWith("start") ? 0 : placement.endsWith("end") ? 1 : 0.5;
  const originY = below ? 0 : 1;
  const drop = below ? -6 : 6;
  const variants: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: drop, originX, originY },
    show: { opacity: 1, scale: 1, y: 0, originX, originY, pointerEvents: "auto", transition: { ...SPRING.snappy, opacity: enter(0.12) } },
    exit: { opacity: 0, scale: 0.97, y: drop / 2, originX, originY, pointerEvents: "none", transition: leave(0.12) },
  };
  popoverCache.set(placement, variants);
  return variants;
}

/** Toast card from the right edge. Drive with `animate={visible ? "show" : "exit"}`. */
export const toast: Variants = {
  hidden: { opacity: 0, x: 40, scale: 0.96 },
  show: { opacity: 1, x: 0, scale: 1, transition: SPRING.toast },
  exit: { opacity: 0, x: 40, scale: 0.96, transition: SPRING.toast },
};

/**
 * Shared-layout indicator (nav underline, active pill): render ONE element with
 * a stable `layoutId` inside the active item only and give it this transition:
 * `{active && <motion.span layoutId="nav-underline" transition={tabIndicator} />}`.
 * The layoutId must be unique per indicator group on screen.
 */
export const tabIndicator: Transition = SPRING.layout;

// ---------------------------------------------------------------------------
// Interaction props (spread onto motion elements)
// ---------------------------------------------------------------------------

type GestureProps = { whileHover?: TargetAndTransition; whileTap?: TargetAndTransition };

/** Any clickable: subtle press-in. */
export const pressable: GestureProps = {
  whileTap: { scale: 0.97, transition: SPRING.snappy },
};

/** Cards / tiles: lift 2px on hover, press-in on tap. */
export const hoverLift: GestureProps = {
  whileHover: { y: -2, transition: SPRING.snappy },
  whileTap: { scale: 0.97, transition: SPRING.snappy },
};

/** Icon buttons / chips / thumbnails: grow 2% on hover, press-in on tap. */
export const hoverScale: GestureProps = {
  whileHover: { scale: 1.02, transition: SPRING.snappy },
  whileTap: { scale: 0.97, transition: SPRING.snappy },
};

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

const REDUCED_TRANSITION: Transition = { duration: 0.12, ease: "linear" };

/** Keeps only opacity (and pointer-events, which exits use to release clicks early). */
function reduceTarget(target: unknown): any {
  if (typeof target !== "object" || target === null) return target;
  const { opacity, pointerEvents } = target as { opacity?: unknown; pointerEvents?: unknown };
  return {
    ...(opacity === undefined ? null : { opacity }),
    ...(pointerEvents === undefined ? null : { pointerEvents }),
    transition: REDUCED_TRANSITION,
  };
}

/** Opacity-only, no-delay, no-stagger copy of a variants object. */
export function reduceVariants(variants: Variants): Variants {
  const out: Variants = {};
  for (const [label, value] of Object.entries(variants)) {
    out[label] =
      typeof value === "function"
        ? (custom: any, current: any, velocity: any) => reduceTarget(value(custom, current, velocity))
        : reduceTarget(value);
  }
  return out;
}

const NO_GESTURE: GestureProps = {};

const FULL_PRESET = {
  reduced: false,
  states: MOTION_STATES,
  fadeIn,
  fadeUp,
  scaleIn,
  slideIn,
  staggerContainer,
  listItem,
  showcaseUp,
  showcaseStagger,
  showcaseSlide,
  showcaseArt,
  showcaseItem,
  page,
  panelSwap,
  modal,
  popover,
  toast,
  tabIndicator,
  pressable,
  hoverLift,
  hoverScale,
};

export type MotionPreset = Omit<typeof FULL_PRESET, "reduced"> & { reduced: boolean };

const reducedPopoverCache = new Map<PopoverPlacement, Variants>();

const REDUCED_PRESET: MotionPreset = {
  reduced: true,
  states: MOTION_STATES,
  fadeIn: reduceVariants(fadeIn),
  fadeUp: reduceVariants(fadeUp),
  scaleIn: reduceVariants(scaleIn),
  slideIn: (direction, distance) => reduceVariants(slideIn(direction, distance)),
  staggerContainer: () => reduceVariants(staggerContainer(0, 0)),
  listItem: reduceVariants(listItem),
  showcaseUp: reduceVariants(showcaseUp),
  showcaseStagger: () => reduceVariants(staggerContainer(0, 0)),
  showcaseSlide: (from, distance) => reduceVariants(showcaseSlide(from, distance)),
  showcaseArt: reduceVariants(showcaseArt),
  showcaseItem: reduceVariants(showcaseItem),
  page: reduceVariants(page),
  panelSwap: reduceVariants(panelSwap),
  modal: { backdrop: reduceVariants(modal.backdrop), panel: reduceVariants(modal.panel) },
  popover: (placement = "bottom-end") => {
    let v = reducedPopoverCache.get(placement);
    if (!v) {
      v = reduceVariants(popover(placement));
      reducedPopoverCache.set(placement, v);
    }
    return v;
  },
  toast: reduceVariants(toast),
  tabIndicator: { duration: 0 },
  pressable: NO_GESTURE,
  hoverLift: NO_GESTURE,
  hoverScale: NO_GESTURE,
};

/**
 * Presets that respect reduced motion (OS setting via the root `MotionConfig`).
 * `const m = useMotionPreset(); <motion.div variants={m.fadeUp} {...m.states} />`
 */
export function useMotionPreset(): MotionPreset {
  const reduced = !!useReducedMotionConfig();
  return useMemo(() => (reduced ? REDUCED_PRESET : FULL_PRESET), [reduced]);
}
