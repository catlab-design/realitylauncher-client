import React from 'react';
import ReactDOM from 'react-dom/client';
import LauncherApp from './components/LauncherApp';
import './styles/global.css';
import './api';
import { installPageVisibility } from './lib/pageVisibility';

installPageVisibility();

if (import.meta.env.DEV && import.meta.env.VITE_PERF_BENCH === '1') {
    void import('./lib/perfBench').then((m) => m.scheduleBench());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <LauncherApp />
    </React.StrictMode>
);
