import React, { useEffect, useRef, useState, useId } from "react";
import { cn } from "../../lib/utils";

interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  speed?: number; // pixels per second
  delay?: number; // seconds before starting
  gradient?: boolean;
  gradientWidth?: number;
  pauseOnHover?: boolean;
}

export const Marquee: React.FC<MarqueeProps> = ({
  children,
  className,
  speed = 30, // Default slow speed for readability
  delay = 0,
  gradient = false,
  gradientWidth = 20,
  pauseOnHover = true,
  ...props
}) => {
  const checkboxId = useId().replace(/:/g, ""); // Create valid CSS ID
  const animationName = `marquee-${checkboxId}`;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pausePercent, setPausePercent] = useState(0);

  useEffect(() => {
    const calculateOverflow = () => {
      if (containerRef.current && measureRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = measureRef.current.getBoundingClientRect().width;
        
        const isOver = textWidth > containerWidth;
        setIsOverflowing(isOver);

        if (isOver) {
            const gap = 48;
            const textWidth = measureRef.current.getBoundingClientRect().width;
            const totalDistance = textWidth + gap;
            
            // Fixed pause time of 2 seconds
            const pauseTime = 2;
            const moveTime = totalDistance / speed;
            const totalDuration = moveTime + pauseTime;
            
            setDuration(totalDuration);
            setPausePercent((pauseTime / totalDuration) * 100);
        }
      }
    };

    // Initial check
    calculateOverflow();

    // Use ResizeObserver for more robust monitoring
    const resizeObserver = new ResizeObserver(() => {
        calculateOverflow();
    });

    if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
    }
    
    // Also window resize as fallback
    window.addEventListener("resize", calculateOverflow);
    
    return () => {
        resizeObserver.disconnect();
        window.removeEventListener("resize", calculateOverflow);
    };
  }, [children, speed]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full overflow-hidden relative select-none", className)}
      {...props}
      style={{
        maskImage: (isOverflowing && gradient) ? `linear-gradient(to right, transparent, black ${gradientWidth}px, black calc(100% - ${gradientWidth}px), transparent)` : undefined,
        WebkitMaskImage: (isOverflowing && gradient) ? `linear-gradient(to right, transparent, black ${gradientWidth}px, black calc(100% - ${gradientWidth}px), transparent)` : undefined,
      }}
    >
      <style>{`
        @keyframes ${animationName} {
          0% { transform: translateX(0); }
          ${pausePercent}% { transform: translateX(0); } 
          100% { transform: translateX(-50%); } 
        }
        .animate-${animationName} {
          animation: ${animationName} linear infinite;
        }
      `}</style>
      
      {/* Ghost Element for Measurement - Absolute to not affect layout, hidden */}
      <span 
        ref={measureRef} 
        className="absolute top-0 left-0 opacity-0 pointer-events-none whitespace-nowrap"
        aria-hidden="true"
      >
        {children}
      </span>

      {!isOverflowing ? (
        <div className="truncate w-full block">
            {children}
        </div>
      ) : (
        <div 
            className={cn("flex min-w-full items-center", pauseOnHover && "pause-on-hover")}
            style={{ width: "max-content" }}
        >
            <div 
                className={`flex items-center animate-${animationName}`}
                style={{ 
                    animationDuration: `${duration}s`,
                    animationDelay: `${delay}s`,
                }}
            >
                <div>
                     <span style={{ paddingRight: '48px', whiteSpace: 'nowrap' }}>{children}</span>
                </div>
                <div aria-hidden="true">
                     <span style={{ paddingRight: '48px', whiteSpace: 'nowrap' }}>{children}</span>
                </div>
            </div>
            
            <style>{`
                .pause-on-hover:hover .animate-${animationName} {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
      )}
    </div>
  );
};
