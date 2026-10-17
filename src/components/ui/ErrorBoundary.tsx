
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { useConfigStore } from "../../store/configStore";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    copied: boolean;
}

// The boundary sits above the theme providers, so this screen carries its own
// neutral dark palette and its own two-language copy.
const COPY = {
    th: {
        title: "เกิดข้อผิดพลาดบางอย่าง",
        body: "แอปทำงานต่อไม่ได้ในหน้านี้ ลองโหลดแอปใหม่ ข้อมูลและ instance ของคุณไม่ได้หายไป",
        reload: "โหลดแอปใหม่",
        copy: "คัดลอกรายละเอียด",
        copied: "คัดลอกแล้ว",
        details: "รายละเอียดข้อผิดพลาด",
        hint: "ถ้ายังเกิดซ้ำ ส่งรายละเอียดนี้ให้ทีมงานทาง Discord",
    },
    en: {
        title: "Something went wrong",
        body: "The app can't continue on this page. Try reloading. Your data and instances are safe.",
        reload: "Reload app",
        copy: "Copy details",
        copied: "Copied",
        details: "Error details",
        hint: "If it keeps happening, send these details to the team on Discord.",
    },
} as const;

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
        copied: false,
    };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    private detailsText() {
        return `${this.state.error?.toString() ?? ""}\n${this.state.errorInfo?.componentStack ?? ""}`.trim();
    }

    private copyDetails = () => {
        navigator.clipboard?.writeText(this.detailsText()).then(() => {
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 1500);
        });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            let lang: "th" | "en" = "th";
            try {
                lang = useConfigStore.getState().language === "en" ? "en" : "th";
            } catch {
            }
            const c = COPY[lang];
            return (
                <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#0a0a0b] text-[#f5f5f5]">
                    <div className="w-full max-w-2xl rounded-3xl p-8 sm:p-10 bg-[#121214] shadow-2xl">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-[#ef4444]/15 text-[#f87171]">
                            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-black tracking-tight">{c.title}</h2>
                        <p className="mt-3 text-base leading-relaxed text-[#9a9aa2]">{c.body}</p>

                        <div className="flex flex-wrap gap-3 mt-7">
                            <button
                                className="h-12 px-6 rounded-xl text-[15px] font-bold bg-[#ffdd57] text-[#111] transition hover:brightness-105 active:scale-[0.98]"
                                onClick={() => window.location.reload()}
                            >
                                {c.reload}
                            </button>
                            <button
                                className="h-12 px-6 rounded-xl text-[15px] font-semibold bg-[#242428] text-[#f5f5f5] transition hover:brightness-110 active:scale-[0.98]"
                                onClick={this.copyDetails}
                            >
                                {this.state.copied ? c.copied : c.copy}
                            </button>
                        </div>

                        <details className="mt-8 group">
                            <summary className="cursor-pointer select-none text-sm font-semibold text-[#9a9aa2] hover:text-[#f5f5f5] transition-colors">
                                {c.details}
                            </summary>
                            <pre className="mt-3 max-h-64 overflow-auto rounded-xl p-4 text-[13px] leading-relaxed font-mono whitespace-pre-wrap wrap-break-word bg-[#0a0a0b] text-[#fca5a5]">
                                {this.detailsText()}
                            </pre>
                            <p className="mt-3 text-sm text-[#9a9aa2]">{c.hint}</p>
                        </details>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
