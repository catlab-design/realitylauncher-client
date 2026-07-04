import React from 'react';
import ReactDOM from 'react-dom/client';
import LauncherApp from './components/LauncherApp';
import './styles/global.css';
import './api';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <LauncherApp />
    </React.StrictMode>
);
