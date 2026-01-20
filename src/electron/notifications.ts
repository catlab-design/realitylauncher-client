/**
 * Notifications Module
 * Handles fetching announcements and user notifications from ml-api
 */

// API URL from environment or default
const API_URL = 'https://api.reality.notpumpkins.com';

export interface Announcement {
    id: string;
    title: string;
    message: string;
    type: 'news' | 'info' | 'warning' | 'success';
    icon?: string | null;
    createdBy: string;
    expiresAt?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Notification {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string | null;
    data?: string | null;
    actionUrl?: string | null;
    isRead: boolean;
    createdAt: string;
}

/**
 * Fetch all active announcements (public, no auth required)
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
    try {
        const response = await fetch(`${API_URL}/announcements`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            console.error('[Notifications] Failed to fetch announcements:', response.statusText);
            return [];
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[Notifications] Error fetching announcements:', error);
        return [];
    }
}

/**
 * Fetch user's personal notifications (requires auth)
 */
export async function fetchUserNotifications(authToken: string): Promise<Notification[]> {
    try {
        const response = await fetch(`${API_URL}/announcements/notifications`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });

        if (!response.ok) {
            // console.warn('[Notifications] Failed to fetch user notifications:', response.statusText);
            return [];
        }

        const data = await response.json();
        return data;
    } catch (error) {
        // console.error('[Notifications] Error fetching user notifications:', error);
        return [];
    }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string, authToken: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/announcements/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });

        return response.ok;
    } catch (error) {
        console.error('[Notifications] Error marking notification as read:', error);
        return false;
    }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, authToken: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/announcements/notifications/${notificationId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });

        return response.ok;
    } catch (error) {
        console.error('[Notifications] Error deleting notification:', error);
        return false;
    }
}

/**
 * Helper: Get icon and color for announcement type
 */
export function getAnnouncementStyle(type: string) {
    switch (type) {
        case 'news':
            return { icon: '📰', color: '#ffde59' };
        case 'info':
            return { icon: 'ℹ️', color: '#3b82f6' };
        case 'warning':
            return { icon: '⚠️', color: '#f59e0b' };
        case 'success':
            return { icon: '✅', color: '#10b981' };
        default:
            return { icon: '📢', color: '#6b7280' };
    }
}

/**
 * Helper: Format relative time
 */
export function getRelativeTime(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'เมื่อสักครู่';
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`;

    return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Invitation types
 */
export interface Invitation {
    id: string;
    instanceId: string;
    instanceName: string;
    instanceIcon?: string | null;
    invitedBy: string;
    inviterName?: string;
    role: 'member' | 'admin';
    message?: string | null;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
}

/**
 * Fetch pending invitations for current user
 */
export async function fetchInvitations(authToken: string): Promise<Invitation[]> {
    try {
        const response = await fetch(`${API_URL}/invitations`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });

        if (!response.ok) {
            // console.warn('[Invitations] Failed to fetch:', response.statusText);
            return [];
        }

        const data = await response.json();
        // Transform API response to our Invitation interface
        return (data.invitations || []).map((inv: any) => ({
            id: inv.invitation?.id || inv.id,
            instanceId: inv.instance?.id || inv.instanceId,
            instanceName: inv.instance?.name || inv.instanceName || 'Unknown',
            instanceIcon: inv.instance?.iconUrl || null,
            invitedBy: inv.invitation?.invitedBy || inv.invitedBy,
            inviterName: inv.inviter?.catidUsername || null,
            role: inv.invitation?.role || inv.role || 'member',
            message: inv.invitation?.message || inv.message,
            status: inv.invitation?.status || inv.status || 'pending',
            createdAt: inv.invitation?.createdAt || inv.createdAt,
        }));
    } catch (error) {
        // console.error('[Invitations] Error fetching:', error);
        return [];
    }
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(invitationId: string, authToken: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/invitations/${invitationId}/accept`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });

        if (!response.ok) {
            console.error(`[Invitations] Accept failed: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`[Invitations] Response: ${text}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Invitations] Error accepting:', error);
        return false;
    }
}

/**
 * Reject an invitation
 */
export async function rejectInvitation(invitationId: string, authToken: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/invitations/${invitationId}/reject`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });

        if (!response.ok) {
            console.error(`[Invitations] Reject failed: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`[Invitations] Response: ${text}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Invitations] Error rejecting:', error);
        return false;
    }
}
