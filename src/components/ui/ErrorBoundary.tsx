
import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="p-8 m-4 bg-red-900/20 border border-red-500/50 rounded-2xl text-red-200 overflow-auto max-h-full">
                    <h2 className="text-xl font-bold mb-4 text-red-400">Something went wrong</h2>
                    <div className="text-sm font-mono whitespace-pre-wrap bg-black/50 p-4 rounded-xl">
                        {this.state.error?.toString()}
                        <br />
                        <br />
                        {this.state.errorInfo?.componentStack}
                    </div>
                    <button
                        className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-bold transition"
                        onClick={() => window.location.reload()}
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
