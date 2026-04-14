

import { ipcMain } from "electron";
import { getSession } from "../auth.js";

export function registerNotificationHandlers(): void {
    
    ipcMain.handle("notifications-fetch-announcements", async () => {
        try {
            const { fetchAnnouncements } = await import("../notifications.js");
            return await fetchAnnouncements();
        } catch (error: any) {
            console.error("[Notifications] Error fetching announcements:", error);
            return [];
        }
    });

    
    ipcMain.handle("notifications-fetch-user", async () => {
        try {
            const session = getSession();
            if (!session?.apiToken) return [];

            const { fetchUserNotifications } = await import("../notifications.js");
            return await fetchUserNotifications(session.apiToken);
        } catch (error: any) {
            
            return [];
        }
    });

    
    ipcMain.handle("notifications-sync", async () => {
        try {
            const session = getSession();
            if (!session?.apiToken) {
                return { notifications: [], invitations: [] };
            }

            const { fetchNotificationSync } = await import("../notifications.js");
            return await fetchNotificationSync(session.apiToken);
        } catch {
            return { notifications: [], invitations: [] };
        }
    });

    
    ipcMain.handle("notifications-mark-read", async (_event, notificationId: string) => {
        try {
            const session = getSession();
            if (!session?.apiToken) return false;

            const { markNotificationAsRead } = await import("../notifications.js");
            return await markNotificationAsRead(notificationId, session.apiToken);
        } catch (error: any) {
            console.error("[Notifications] Error marking notification as read:", error);
            return false;
        }
    });

    
    ipcMain.handle("notifications-delete", async (_event, notificationId: string) => {
        try {
            const session = getSession();
            if (!session?.apiToken) return false;

            const { deleteNotification } = await import("../notifications.js");
            return await deleteNotification(notificationId, session.apiToken);
        } catch (error: any) {
            console.error("[Notifications] Error deleting notification:", error);
            return false;
        }
    });

    
    ipcMain.handle("invitations-fetch", async () => {
        try {
            const session = getSession();
            if (!session?.apiToken) return [];

            const { fetchInvitations } = await import("../notifications.js");
            return await fetchInvitations(session.apiToken);
        } catch (error: any) {
            console.error("[Invitations] Error fetching:", error);
            return [];
        }
    });

    
    ipcMain.handle("invitations-accept", async (_event, invitationId: string) => {
        try {
            const session = getSession();
            if (!session?.apiToken) return false;

            const { acceptInvitation } = await import("../notifications.js");
            return await acceptInvitation(invitationId, session.apiToken);
        } catch (error: any) {
            console.error("[Invitations] Error accepting:", error);
            return false;
        }
    });

    
    ipcMain.handle("invitations-reject", async (_event, invitationId: string) => {
        try {
            const session = getSession();
            if (!session?.apiToken) return false;

            const { rejectInvitation } = await import("../notifications.js");
            return await rejectInvitation(invitationId, session.apiToken);
        } catch (error: any) {
            console.error("[Invitations] Error rejecting:", error);
            return false;
        }
    });

    console.log("[IPC] Notification handlers registered");
}
