import { useEffect, useRef } from "react";
import gsap from "gsap";
import rIcon from "../../assets/r.svg";
import { useTranslation } from "../../hooks/useTranslation";

interface LoadingScreenProps {
    onComplete: () => void;
    themeColor: string;
}

const SPLASH_DURATION_S = 3;

export function LoadingScreen({ onComplete, themeColor }: LoadingScreenProps) {
    const { t } = useTranslation();
    const progressBarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        void (window as any).api?.checkLatestVersion?.().catch(() => {});
    }, []);

    useEffect(() => {
        let completed = false;
        const completeLoading = () => {
            if (completed) return;
            completed = true;
            gsap.to(".loading-screen", { opacity: 0, duration: 0.4, ease: "power1.out", onComplete });
        };

        const isDevMode = typeof window !== "undefined" &&
            (window.location.hostname === "localhost" || window.location.port === "4321");

        if (isDevMode) {
            console.log("[LoadingScreen] Dev mode - skipping animation");
            setTimeout(completeLoading, 100);
            return;
        }

        // Every launch shows the splash for exactly SPLASH_DURATION_S seconds.
        const fallbackTimeout = setTimeout(completeLoading, (SPLASH_DURATION_S + 0.5) * 1000);

        try {
            gsap.fromTo(
                progressBarRef.current,
                { width: "0%" },
                {
                    width: "100%",
                    duration: SPLASH_DURATION_S,
                    ease: "power1.inOut",
                    onComplete: () => {
                        clearTimeout(fallbackTimeout);
                        completeLoading();
                    },
                },
            );
        } catch (error) {
            console.error("[LoadingScreen] GSAP error:", error);
            clearTimeout(fallbackTimeout);
            completeLoading();
        }

        return () => clearTimeout(fallbackTimeout);
    }, [onComplete]);

    return (
        <div
            data-tauri-drag-region
            className="loading-screen fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden select-none text-white"
            style={{
                background: "radial-gradient(120% 120% at 50% 0%, #1c1c22 0%, #0a0a0c 55%, #000 100%)",
            }}
        >
            <div
                className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl opacity-25 animate-pulse"
                style={{ backgroundColor: themeColor || "#6366f1" }}
            />

            <div data-tauri-drag-region className="relative flex flex-1 flex-col items-center justify-center gap-6 px-8">
                <div className="relative flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-white/10" />
                    <span
                        className="absolute inset-0 rounded-full border-t-2 animate-spin"
                        style={{ borderTopColor: themeColor || "#6366f1", animationDuration: "1.6s" }}
                    />
                    <img
                        src={rIcon}
                        alt="Reality"
                        className="h-10 w-10 object-contain opacity-90 brightness-125 saturate-0 drop-shadow-[0_0_18px_rgba(255,255,255,0.15)]"
                    />
                </div>

                <div className="flex flex-col items-center gap-1.5">
                    <h1
                        data-tauri-drag-region
                        className="text-sm font-semibold tracking-[0.35em] text-white/90 uppercase"
                    >
                        Reality
                    </h1>
                    <div data-tauri-drag-region className="text-xs font-medium text-white/40">
                        {t("loading") || "Loading..."}
                    </div>
                </div>
            </div>

            <div className="w-full px-8 pb-7">
                <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                    <div
                        ref={progressBarRef}
                        className="h-full rounded-full"
                        style={{
                            width: "0%",
                            background: `linear-gradient(90deg, ${themeColor || "#6366f1"}aa, ${themeColor || "#6366f1"})`,
                            boxShadow: `0 0 10px ${themeColor || "#6366f1"}80`,
                        }}
                    />
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] font-medium tracking-[0.15em] text-white/30 uppercase">
                        Reality Launcher
                    </span>
                    <button
                        onClick={() => (window as any).api?.windowClose()}
                        className="rounded-md px-3 py-1 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
                    >
                        {t("cancel") || "Cancel"}
                    </button>
                </div>
            </div>
        </div>
    );
}
