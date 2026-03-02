import React, { useEffect, useState } from "react";
import ReactMarkdown from 'react-markdown';
import { useTranslation } from "../../hooks/useTranslation";

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
    version: string;
    changelog: string;
    colors: {
        surface: string;
        surfaceContainer: string;
        surfaceContainerHighest: string;
        onSurface: string;
        onSurfaceVariant: string;
        secondary: string;
        primary: string;
        outline: string;
    };
}

export function ChangelogModal({
    isOpen,
    onClose,
    version,
    changelog,
    colors,
}: ChangelogModalProps) {
    const { t } = useTranslation();
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsAnimating(true);
                });
            });
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setShouldRender(false), 200);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!shouldRender) return null;

    const components = {
        h1: ({ node, ...props }: any) => <h2 className="text-lg font-bold mt-4 mb-2" style={{ color: colors.onSurface }} {...props} />,
        h2: ({ node, ...props }: any) => (
            <h3 className="text-base font-semibold mt-3 mb-2 flex items-center gap-2" style={{ color: colors.onSurface }} {...props}>
                <i className="fa-solid fa-tag text-xs" style={{ color: colors.secondary }}></i>
                {props.children}
            </h3>
        ),
        h3: ({ node, ...props }: any) => <h4 className="text-sm font-medium mt-2 mb-1" style={{ color: colors.onSurface }} {...props} />,
        ul: ({ node, ...props }: any) => <ul className="list-none space-y-1 my-2" {...props} />,
        ol: ({ node, ...props }: any) => <ol className="list-decimal list-inside space-y-1 my-2" style={{ color: colors.onSurfaceVariant }} {...props} />,
        li: ({ node, children, ...props }: any) => {
            return (
                <li className="text-xs flex items-start gap-2" style={{ color: colors.onSurfaceVariant }} {...props}>
                    <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: colors.onSurfaceVariant }}></span>
                    <span className="flex-1">{children}</span>
                </li>
            );
        },
        p: ({ node, ...props }: any) => <p className="text-xs py-0.5" style={{ color: colors.onSurfaceVariant }} {...props} />,
        a: ({ node, href, children, ...props }: any) => (
            <a 
                className="underline decoration-1 underline-offset-2 cursor-pointer" 
                href={href || "#"}
                onClick={(e) => {
                    e.preventDefault();
                    if (href && (href.startsWith('http') || href.startsWith('https'))) {
                        (window as any).api?.openExternal?.(href);
                    }
                }}
                style={{ color: colors.primary }} 
                {...props}
            >
                {children}
            </a>
        ),
        img: ({ node, ...props }: any) => (
            <img
                className="max-w-full rounded-lg my-2 border shadow-sm"
                style={{ borderColor: colors.outline }}
                alt={props.alt || ''}
                {...props}
            />
        ),
        blockquote: ({ node, ...props }: any) => (
            <blockquote className="border-l-2 pl-3 py-1 my-2 text-xs italic" style={{ borderColor: colors.secondary, color: colors.onSurfaceVariant }} {...props} />
        ),
        code: ({ node, inline, className, children, ...props }: any) => {
            return (
                <code
                    className={`${inline ? 'px-1 py-0.5 rounded' : 'block p-2 rounded-md overflow-x-auto'} text-xs font-mono`}
                    style={{
                        backgroundColor: colors.surfaceContainerHighest,
                        color: colors.onSurface
                    }}
                    {...props}
                >
                    {children}
                </code>
            );
        }
    };

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${isAnimating ? 'bg-black/50' : 'bg-black/0'
                }`}
            onClick={onClose}
        >
            <div
                className={`w-full max-w-sm rounded-lg shadow-xl relative overflow-hidden transition-all duration-200 ${isAnimating
                        ? 'opacity-100 scale-100'
                        : 'opacity-0 scale-95'
                    }`}
                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.outline}40` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-4 py-3 border-b flex items-center gap-3"
                    style={{ borderColor: colors.outline + "30", backgroundColor: colors.surfaceContainer }}
                >
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: colors.secondary }}
                    >
                        <i className="fa-solid fa-check text-sm" style={{ color: '#1a1a1a' }}></i>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold" style={{ color: colors.onSurface }}>
                            {t('update_successful')}
                        </h2>
                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                            {t('version')} {version}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-black/10"
                    >
                        <i className="fa-solid fa-xmark text-sm" style={{ color: colors.onSurfaceVariant }}></i>
                    </button>
                </div>

                {/* Changelog Content */}
                <div
                    className="px-4 py-3 max-h-[280px] overflow-y-auto"
                    style={{ backgroundColor: colors.surface }}
                >
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: colors.onSurfaceVariant }}>
                        {t('whats_new')}
                    </p>
                    {changelog ? (
                        <ReactMarkdown components={components}>
                            {changelog}
                        </ReactMarkdown>
                    ) : (
                        <p style={{ color: colors.onSurfaceVariant }}>{t('no_update_details')}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t" style={{ borderColor: colors.outline + "30" }}>
                    <button
                        onClick={onClose}
                        className="w-full py-2 rounded-md text-sm font-medium transition-colors"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        {t('confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}
