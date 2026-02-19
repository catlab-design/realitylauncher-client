import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import rIcon from "../../assets/r.svg";
import { useTranslation } from "../../hooks/useTranslation";

interface LoadingScreenProps {
    onComplete: () => void;
    themeColor: string;
}

export function LoadingScreen({ onComplete, themeColor }: LoadingScreenProps) {
    const { t } = useTranslation();
    const logoRef = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let completed = false;

        // Dev mode detection - localhost:4321 = Astro dev server
        const isDevMode = typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.port === '4321');

        const completeLoading = () => {
            if (completed) return;
            completed = true;
            gsap.to(".loading-screen", { opacity: 0, duration: isDevMode ? 0.1 : 0.5, onComplete });
        };

        // Skip animation in dev mode for faster loading
        if (isDevMode) {
            console.log("[LoadingScreen] Dev mode - skipping animation");
            setProgress(100);
            setTimeout(completeLoading, 100);
            return;
        }

        // Fallback timeout in case GSAP fails
        const fallbackTimeout = setTimeout(() => {
            console.log("[LoadingScreen] Fallback timeout triggered");
            setProgress(100);
            completeLoading();
        }, 4000);

        try {
            const tl = gsap.timeline({
                onComplete: () => {
                    clearTimeout(fallbackTimeout);
                    completeLoading();
                },
            });

            // Animate progress with percentage counter
            tl.to({ val: 0 }, {
                val: 100,
                duration: 2.5,
                ease: "power2.inOut",
                onUpdate: function () {
                    const value = Math.round(this.targets()[0].val);
                    setProgress(value);
                }
            }, "-=0.3");
        } catch (error) {
            console.error("[LoadingScreen] GSAP error:", error);
            clearTimeout(fallbackTimeout);
            setProgress(100);
            completeLoading();
        }

        return () => {
            clearTimeout(fallbackTimeout);
        };
    }, [onComplete]);

    return (
        <div className="loading-screen fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: themeColor }}>
            {/* Title Bar Drag Region with Window Controls */}
            <div className="h-10 w-full shrink-0 flex items-center justify-end pr-0 drag-region">
                {/* Window Control Buttons */}
                <div className="flex items-center gap-0 no-drag">
                    {/* Minimize */}
                    <button
                        onClick={() => window.api?.windowMinimize()}
                        className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
                        style={{ color: "#1a1a1a" }}
                        title={t("minimize")}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 13H5v-2h14v2z" />
                        </svg>
                    </button>
                    {/* Maximize */}
                    <button
                        onClick={() => window.api?.windowMaximize()}
                        className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
                        style={{ color: "#1a1a1a" }}
                        title={t("maximize")}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
                        </svg>
                    </button>
                    {/* Close */}
                    <button
                        onClick={() => window.api?.windowClose()}
                        className="w-12 h-10 flex items-center justify-center transition-all hover:bg-red-500 hover:text-white!"
                        style={{ color: "#1a1a1a" }}
                        title={t("close")}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bottom Section */}
            <div className="px-8 pb-4">
                {/* Logo + Title + Percentage Row */}
                <div className="flex items-center justify-between mb-4">
                    {/* Left - Logo + Title */}
                    <div ref={logoRef} className="flex items-center gap-3">
                        <img src={rIcon.src} alt="Reality" className="w-12 h-12 object-contain" />
                        <span className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Inter', sans-serif" }}>
                            Reality
                        </span>
                    </div>

                    {/* Right - Percentage */}
                    <div className="text-2xl font-bold text-gray-900 tabular-nums" style={{ fontFamily: "'Prompt', sans-serif" }}>
                        {progress}%
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-5 bg-white/50 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gray-800 rounded-full transition-all duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
