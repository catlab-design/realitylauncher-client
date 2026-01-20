
import React, { useState } from "react";

interface ImagePreviewModalProps {
    colors: any;
    imageUrl: string;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    hasNext?: boolean;
    hasPrev?: boolean;
    preloadUrls?: string[];
    imageIndex?: number;
    totalImages?: number;
}

export function ImagePreviewModal({ colors, imageUrl, onClose, onNext, onPrev, hasNext, hasPrev, preloadUrls, imageIndex, totalImages }: ImagePreviewModalProps) {
    const [isLoading, setIsLoading] = useState(true);

    // Preload images
    React.useEffect(() => {
        if (preloadUrls && preloadUrls.length > 0) {
            preloadUrls.forEach(url => {
                if (url) {
                    const img = new Image();
                    img.src = url;
                }
            });
        }
    }, [preloadUrls]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight" && onNext && hasNext) onNext();
            if (e.key === "ArrowLeft" && onPrev && hasPrev) onPrev();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, onNext, onPrev, hasNext, hasPrev]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={handleBackdropClick}>

            {/* Image Counter / Pagination Toolbar - Only show when loaded */}
            {!isLoading && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 z-50">
                    <button
                        onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
                        disabled={!hasPrev}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${hasPrev ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95 cursor-pointer' : 'bg-transparent text-white/20 cursor-not-allowed'}`}
                    >
                        <i className="fa-solid fa-chevron-left text-sm"></i>
                    </button>

                    <span className="text-sm font-medium text-white/90 min-w-[3rem] text-center">
                        {(imageIndex !== undefined && totalImages) ? `${imageIndex + 1} / ${totalImages}` : ''}
                    </span>

                    <button
                        onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                        disabled={!hasNext}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${hasNext ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95 cursor-pointer' : 'bg-transparent text-white/20 cursor-not-allowed'}`}
                    >
                        <i className="fa-solid fa-chevron-right text-sm"></i>
                    </button>

                    {/* Divider */}
                    <div className="w-px h-6 bg-white/20 mx-1"></div>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-red-500/80 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        aria-label="Close"
                    >
                        <i className="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>
            )}

            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                    {/* Skeleton Screen */}
                    <div className="w-[60vw] h-[60vh] bg-white/5 rounded-lg animate-pulse overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] animate-[shimmer_1.5s_infinite]"></div>
                        {/* Skeleton Icon */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <i className="fa-regular fa-image text-6xl text-white"></i>
                        </div>
                    </div>
                </div>
            )}

            <div className="relative flex items-center justify-center max-w-[90vw] max-h-[80vh]" // Reduced max-h to make room for toolbar
                onClick={e => e.stopPropagation()}>

                <img
                    key={imageUrl} // Force re-render on URL change to restart animation/loading
                    src={imageUrl}
                    alt="Preview"
                    className={`max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl duration-300 ${isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                    onLoad={() => setIsLoading(false)}
                />

            </div>
        </div>
    );
}
