import React, { useEffect, useState, useCallback } from "react";
import { playClick } from "../../lib/sounds";

interface Invitation {
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

interface NotificationInboxProps {
    isOpen: boolean;
    onClose: () => void;
    onInvitationAccepted?: () => void;
    colors: {
        surface: string;
        surfaceContainer: string;
        surfaceContainerHighest: string;
        onSurface: string;
        onSurfaceVariant: string;
        outline: string;
        primary: string;
        secondary: string;
    };
    notifications?: any[];
    announcements?: any[];
    isFullscreen?: boolean;
    onNotificationChanged?: () => void;
}

export function NotificationInbox({ isOpen, onClose, onInvitationAccepted, onNotificationChanged, colors, announcements = [], notifications = [], isFullscreen = false }: NotificationInboxProps) {
    const [activeTab, setActiveTab] = useState<'news' | 'system'>('system');
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchInvitations = useCallback(async () => {
        if (!window.api?.invitationsFetch) return;
        setIsLoading(true);
        try {
            const data = await window.api.invitationsFetch();
            setInvitations(data || []);
        } catch (error) {
            console.error('[NotificationInbox] Error fetching invitations:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchInvitations();
        }
    }, [isOpen, fetchInvitations]);

    const handleAccept = async (invitationId: string) => {
        if (!window.api?.invitationsAccept) return;
        setProcessingId(invitationId);
        try {
            const success = await window.api.invitationsAccept(invitationId);
            if (success) {
                setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
                onInvitationAccepted?.();
            }
        } catch (error) {
            console.error('[NotificationInbox] Error accepting invitation:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (invitationId: string) => {
        if (!window.api?.invitationsReject) return;
        setProcessingId(invitationId);
        try {
            const success = await window.api.invitationsReject(invitationId);
            if (success) {
                setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
            }
        } catch (error) {
            console.error('[NotificationInbox] Error rejecting invitation:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleMarkRead = async (notificationId: string) => {
        if (!window.api?.notificationsMarkRead) return;
        // Optimistic update locally? 
        // We can't easily update props, so we just fire the changed event.
        try {
            const success = await window.api.notificationsMarkRead(notificationId);
            if (success) {
                onNotificationChanged?.();
            }
        } catch (error) {
            console.error('[NotificationInbox] Error marking read:', error);
        }
    };

    const handleDeleteNotification = async (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation(); // Prevent marking as read
        if (!window.api?.notificationsDelete) return;

        // Optimistic UI update could be tricky with props, but let's try to just use the callback
        setProcessingId(notificationId);
        try {
            const success = await window.api.notificationsDelete(notificationId);
            if (success) {
                onNotificationChanged?.();
            }
        } catch (error) {
            console.error('[NotificationInbox] Error deleting notification:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const formatRelativeTime = (dateString: string): string => {
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
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop for click-outside */}
            <div
                className="fixed inset-0 z-[99]"
                onClick={onClose}
            />
            <div
                className={`absolute top-full right-0 mt-3 rounded-2xl shadow-2xl overflow-hidden z-[100] transition-all duration-200 animate-in fade-in zoom-in-95 ${isFullscreen ? 'w-[560px]' : 'w-[480px]'}`}
                style={{
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.outline}`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Header with Glass effect */}
                <div
                    className="px-5 py-4 flex items-center justify-between relative"
                    style={{
                        borderBottom: `1px solid ${colors.outline}20`,
                        background: `linear-gradient(to bottom, ${colors.surface}80, ${colors.surfaceContainer}40)`
                    }}
                >
                    <h3 className="font-bold text-lg" style={{ color: colors.onSurface }}>
                        การแจ้งเตือน
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchInvitations}
                            disabled={isLoading}
                            className="p-2 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 active:scale-95"
                            title="รีเฟรชข้อมูล"
                        >
                            <svg
                                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                                fill="none"
                                stroke={colors.onSurfaceVariant}
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-white/10 transition-all active:scale-95"
                        >
                            <svg className="w-4 h-4" fill="none" stroke={colors.onSurfaceVariant} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex p-2 gap-2" style={{ backgroundColor: colors.surfaceContainerHighest + '40' }}>
                    <button
                        onClick={() => { playClick(); setActiveTab('news'); }}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'news' ? 'shadow-md scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={{
                            backgroundColor: activeTab === 'news' ? colors.secondary : 'transparent',
                            color: activeTab === 'news' ? '#1a1a1a' : colors.onSurfaceVariant
                        }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                        </svg>
                        ข่าวสาร
                        {announcements.length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full font-bold shadow-sm">{announcements.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => { playClick(); setActiveTab('system'); }}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'system' ? 'shadow-md scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={{
                            backgroundColor: activeTab === 'system' ? colors.secondary : 'transparent',
                            color: activeTab === 'system' ? '#1a1a1a' : colors.onSurfaceVariant
                        }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        ระบบ
                        {(invitations.length + notifications.length) > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full font-bold shadow-sm">
                                {invitations.length + notifications.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Content Area */}
                <div className={`overflow-y-auto custom-scrollbar p-2 ${isFullscreen ? 'max-h-[600px]' : 'max-h-[400px]'}`}>
                    {activeTab === 'news' && (
                        <div className="space-y-3 p-2 animate-in slide-in-from-left-4 fade-in duration-300">
                            {announcements.length > 0 ? (
                                announcements.map((announcement: any) => {
                                    // Dynamic Icon based on type
                                    const iconMap: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
                                        news: {
                                            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />,
                                            color: '#3b82f6', bg: '#3b82f620'
                                        },
                                        info: {
                                            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
                                            color: '#0ea5e9', bg: '#0ea5e920'
                                        },
                                        warning: {
                                            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
                                            color: '#f59e0b', bg: '#f59e0b20'
                                        },
                                        success: {
                                            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
                                            color: '#10b981', bg: '#10b98120'
                                        }
                                    };
                                    const style = iconMap[announcement.type] || iconMap.news;

                                    return (
                                        <div key={announcement.id} className="p-4 rounded-2xl border transition-all hover:bg-white/5 group"
                                            style={{ backgroundColor: colors.surface, borderColor: colors.outline + '40' }}>
                                            <div className="flex items-start gap-4">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                                                    style={{ backgroundColor: style.bg, color: style.color }}>
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        {style.icon}
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm mb-1 leading-snug" style={{ color: colors.onSurface }}>{announcement.title}</h4>
                                                    <p className="text-xs leading-relaxed opacity-80 whitespace-pre-wrap" style={{ color: colors.onSurfaceVariant }}>
                                                        {announcement.message}
                                                    </p>
                                                    <p className="text-[10px] mt-2 font-medium opacity-50" style={{ color: colors.onSurfaceVariant }}>
                                                        {formatRelativeTime(announcement.createdAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center opacity-40" style={{ color: colors.onSurfaceVariant }}>
                                    <div className="w-16 h-16 rounded-full bg-gray-500/10 flex items-center justify-center mb-3">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-medium">ยังไม่มีข่าวสารใหม่</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'system' && (
                        <div className="space-y-3 p-2 animate-in slide-in-from-right-4 fade-in duration-300">
                            {isLoading && invitations.length === 0 && notifications.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center" style={{ color: colors.onSurfaceVariant }}>
                                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mb-3"
                                        style={{ color: colors.primary }} />
                                    <p className="text-sm opacity-60">กำลังโหลดข้อมูล...</p>
                                </div>
                            ) : invitations.length === 0 && notifications.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center opacity-40" style={{ color: colors.onSurfaceVariant }}>
                                    <div className="w-16 h-16 rounded-full bg-gray-500/10 flex items-center justify-center mb-3">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-medium">ไม่มีการแจ้งเตือนระบบ</p>
                                </div>
                            ) : (
                                <>
                                    {/* Invitations List */}
                                    {invitations.map((invitation) => (
                                        <div
                                            key={invitation.id}
                                            className="p-4 rounded-2xl border transition-all hover:bg-white/5 relative overflow-hidden group"
                                            style={{
                                                backgroundColor: colors.surface,
                                                borderColor: colors.outline + '40'
                                            }}
                                        >
                                            {/* Indicator Bar */}
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400/50" />

                                            <div className="flex items-start gap-4">
                                                {/* Icon */}
                                                <div
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden border border-white/10"
                                                    style={{ backgroundColor: colors.surfaceContainer }}
                                                >
                                                    {invitation.instanceIcon ? (
                                                        <img src={invitation.instanceIcon} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                                        </svg>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold truncate mb-1" style={{ color: colors.onSurface }}>
                                                        เชิญร่วม {invitation.instanceName}
                                                    </p>
                                                    <p className="text-xs opacity-80 mb-2" style={{ color: colors.onSurfaceVariant }}>
                                                        {invitation.inviterName ? `โดย ${invitation.inviterName}` : 'คำเชิญใหม่'} • <span className="px-1.5 py-0.5 rounded bg-white/10">{invitation.role === 'admin' ? 'ผู้ดูแล' : 'สมาชิก'}</span>
                                                    </p>

                                                    {/* Actions */}
                                                    <div className="flex gap-2 mt-3">
                                                        <button
                                                            onClick={() => handleAccept(invitation.id)}
                                                            disabled={processingId === invitation.id}
                                                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm hover:shadow active:scale-95"
                                                            style={{ backgroundColor: '#22c55e', color: 'white' }}
                                                        >
                                                            {processingId === invitation.id ? (
                                                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    รับคำเชิญ
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(invitation.id)}
                                                            disabled={processingId === invitation.id}
                                                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95 hover:bg-white/10"
                                                            style={{ backgroundColor: 'transparent', color: colors.onSurface, border: `1px solid ${colors.outline}` }}
                                                        >
                                                            {processingId === invitation.id ? (
                                                                <div className="w-3 h-3 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                    ปฏิเสธ
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Generic Notifications List */}
                                    {notifications.map((notification) => {
                                        const typeStyles: Record<string, { icon: React.ReactNode; bgColor: string; color: string }> = {
                                            instance_transfer: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />, bgColor: '#8b5cf620', color: '#8b5cf6' },
                                            instance_update: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />, bgColor: '#3b82f620', color: '#3b82f6' },
                                            update: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />, bgColor: '#10b98120', color: '#10b981' },
                                            download: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />, bgColor: '#3b82f620', color: '#3b82f6' },
                                            error: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />, bgColor: '#ef444420', color: '#ef4444' },
                                            success: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />, bgColor: '#10b98120', color: '#10b981' },
                                            system: { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />, bgColor: '#6b728020', color: '#6b7280' },
                                        };
                                        const style = typeStyles[notification.type] || typeStyles.system;

                                        return (
                                            <div key={notification.id}
                                                className={`p-4 rounded-2xl border transition-all hover:bg-white/5 group relative ${!notification.isRead ? 'cursor-pointer hover:shadow-md' : 'opacity-60'}`}
                                                style={{ backgroundColor: colors.surface, borderColor: colors.outline + '40' }}
                                                onClick={() => !notification.isRead && handleMarkRead(notification.id)}>

                                                {/* Delete Button (Visible on hover) */}
                                                <button
                                                    onClick={(e) => handleDeleteNotification(e, notification.id)}
                                                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                                                    style={{ color: colors.onSurfaceVariant }}
                                                    disabled={processingId === notification.id}
                                                    title="ลบการแจ้งเตือน"
                                                >
                                                    {processingId === notification.id ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    )}
                                                </button>

                                                <div className="flex items-start gap-4">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                                                        style={{ backgroundColor: style.bgColor, color: style.color }}>
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            {style.icon}
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0 pr-6">
                                                        <h4 className="font-bold text-sm mb-1 leading-snug flex items-center gap-2" style={{ color: colors.onSurface }}>
                                                            {notification.title}
                                                            {!notification.isRead && (
                                                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block shadow-sm" />
                                                            )}
                                                        </h4>
                                                        {notification.message && (
                                                            <p className="text-xs leading-relaxed opacity-80 whitespace-pre-wrap" style={{ color: colors.onSurfaceVariant }}>
                                                                {notification.message}
                                                            </p>
                                                        )}
                                                        <p className="text-[10px] mt-2 font-medium opacity-50" style={{ color: colors.onSurfaceVariant }}>
                                                            {formatRelativeTime(notification.createdAt)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
