

import { ipcMain, app } from "electron";

import { API_URL as ML_API_URL } from "../lib/constants.js";

export function registerAdminHandlers(): void {
    
    ipcMain.handle("admin-check-status", async (_event, token: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/check`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                return await response.json() as { isAdmin: boolean; username?: string };
            }
            return { isAdmin: false };
        } catch {
            return { isAdmin: false };
        }
    });

    
    ipcMain.handle("admin-get-settings", async (_event, token: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/settings`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                return { ok: true, settings: await response.json() };
            }
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to get settings" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-save-setting", async (_event, token: string, settingKey: string, value: string) => {
        try {
            let endpoint: string;
            let body: Record<string, string>;

            switch (settingKey) {
                case "microsoft-client-id":
                    endpoint = `${ML_API_URL}/admin/settings/microsoft-client-id`;
                    body = { clientId: value };
                    break;
                case "microsoft-device-client-id":
                    endpoint = `${ML_API_URL}/admin/settings/microsoft-device-client-id`;
                    body = { clientId: value };
                    break;
                case "microsoft-secret":
                    endpoint = `${ML_API_URL}/admin/settings/microsoft-secret`;
                    body = { secret: value };
                    break;
                case "curseforge-api-key":
                    endpoint = `${ML_API_URL}/admin/settings/curseforge-api-key`;
                    body = { apiKey: value };
                    break;
                default:
                    return { ok: false, error: "Unknown setting key" };
            }

            const response = await fetch(endpoint, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });

            if (response.ok) return { ok: true };
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to save setting" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-get-system-info", async () => {
        return { apiUrl: ML_API_URL, version: app.getVersion() };
    });

    
    ipcMain.handle("admin-get-users", async (_event, token: string, page = 1, limit = 20, search = "") => {
        try {
            const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
            if (search) params.set("search", search);

            const response = await fetch(`${ML_API_URL}/admin/users?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json() as { users: any[]; pagination: any };
                return { ok: true, users: data.users, pagination: data.pagination };
            }
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to get users" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-ban-user", async (_event, token: string, userId: string, reason = "") => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/users/${userId}/ban`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ reason }),
            });

            if (response.ok) return { ok: true };
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to ban user" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-unban-user", async (_event, token: string, userId: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/users/${userId}/unban`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) return { ok: true };
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to unban user" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-toggle-user-admin", async (_event, token: string, userId: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/users/${userId}/toggle-admin`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json() as { isAdmin: boolean };
                return { ok: true, isAdmin: data.isAdmin };
            }
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to toggle admin" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-create-user", async (_event, token: string, userData: {
        email: string;
        catidUsername: string;
        password: string;
        isAdmin: boolean;
    }) => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(userData),
            });

            if (response.ok) {
                const data = await response.json() as { user: any };
                return { ok: true, user: data.user };
            }
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to create user" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("admin-get-user-details", async (_event, token: string, userId: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/admin/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json() as any;
                const { sessions, ...user } = data;
                return { ok: true, user, sessions: sessions || [] };
            }
            const error = await response.json() as { message?: string };
            return { ok: false, error: error.message || "Failed to get user details" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    console.log("[IPC] Admin handlers registered");
}
