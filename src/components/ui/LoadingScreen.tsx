import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import rIcon from "../../assets/r.svg";
import { useTranslation } from "../../hooks/useTranslation";

interface LoadingScreenProps {
    onComplete: () => void;
    themeColor: string; // Ignored for splash screen to maintain robust dark style
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
    const { t } = useTranslation();
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let completed = false;

        // Dev mode detection
        const isDevMode = typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.port === '4321');

        const completeLoading = () => {
            if (completed) return;
            completed = true;
            gsap.to(".loading-screen", { opacity: 0, duration: isDevMode ? 0.1 : 0.5, onComplete });
        };

        if (isDevMode) {
            console.log("[LoadingScreen] Dev mode - skipping animation");
            setProgress(100);
            setTimeout(completeLoading, 100);
            return;
        }

        const fallbackTimeout = setTimeout(() => {
            console.log("[LoadingScreen] Fallback timeout triggered");
            setProgress(100);
            completeLoading();
        }, 4000);

        const progressBar = document.querySelector(".progress-bar-fill") as HTMLElement;

        try {
            const tl = gsap.timeline({
                onComplete: () => {
                    clearTimeout(fallbackTimeout);
                    completeLoading();
                },
            });

            tl.to({ val: 0 }, {
                val: 100,
                duration: 2.5,
                ease: "power2.inOut",
                onUpdate: function () {
                    const value = Math.round(this.targets()[0].val);
                    if (progressBar) progressBar.style.width = `${value}%`;
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
        <div className="loading-screen fixed inset-0 z-50 flex flex-col bg-[#09090b] text-white overflow-hidden drag-region select-none">
            {/* Main content - Centered Logo */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                {/* Logo wrapper */}
                <div className="relative w-24 h-24 mb-6">
                    {/* Optional glow effect behind logo */}
                    <div className="absolute inset-0 bg-white/10 blur-xl rounded-full animate-pulse"></div>
                    <img 
                        src={rIcon.src} 
                        alt="Reality Logo" 
                        className="w-full h-full object-contain drop-shadow-2xl brightness-125 saturate-0"
                    />
                </div>
                
                {/* Title */}
                <h1 className="text-2xl font-bold tracking-widest text-[#f4f4f5] uppercase" style={{ fontFamily: "'Inter', sans-serif" }}>
                    Reality
                </h1>
                
                {/* Status text */}
                <div className="mt-8 text-sm font-medium text-[#a1a1aa] tracking-wide animate-pulse">
                    {t('loading') || 'Loading...'}
                </div>
            </div>

            {/* Bottom Footer - Roblox Style */}
            <div className="w-full bg-[#18181b] border-t border-[#27272a] p-4 flex flex-col relative no-drag">
                {/* Progress bar line right above the footer */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-[#27272a] -translate-y-full">
                    <div 
                        className="progress-bar-fill h-full bg-[#3b82f6] transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.6)]" 
                        style={{ width: '0%' }}
                    ></div>
                </div>

                <div className="flex justify-between items-center px-1">
                    <div className="font-bold text-[#71717a] text-[10px] tracking-[0.2em] uppercase"> Reality Launcher </div>
                    <button 
                        onClick={() => window.api?.windowClose()}
                        className="text-xs font-semibold text-[#d4d4d8] bg-[#27272a] hover:bg-[#3f3f46] border border-[#3f3f46] rounded px-5 py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600"
                    >
                        {t('cancel') || 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
}
