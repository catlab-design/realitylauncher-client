/**
 * UserManagement - User Management Section for Admin Panel
 * Features like ml-admin: search, ban/unban with reason, add user, view details
 */

import { useState, useEffect } from "react";
import { Icons } from "../ui/Icons";
import { Skeleton } from "../ui/Skeleton";
import { useTranslation } from "../../hooks/useTranslation";


interface User {
    id: string;
    catidUsername: string;
    email: string;
    minecraftUsername: string | null;
    isAdmin: boolean;
    isBanned: boolean;
    bannedReason?: string;
    createdAt: string;
}

interface Props {
    colors: {
        primary: string;
        onPrimary: string;
        surface: string;
        surfaceContainer: string;
        surfaceContainerHigh: string;
        onSurface: string;
        onSurfaceVariant: string;
        outline: string;
        secondary: string;
    };
    adminToken: string;
    language: string;
}

export default function UserManagement({ colors, adminToken, language }: Props) {
    const { t } = useTranslation(language as any);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Ban Modal State
    const [banModalOpen, setBanModalOpen] = useState(false);
    const [banUserId, setBanUserId] = useState<string | null>(null);
    const [banReason, setBanReason] = useState("");

    // Add User Modal State
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserUsername, setNewUserUsername] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
    const [addUserLoading, setAddUserLoading] = useState(false);
    const [addUserError, setAddUserError] = useState("");

    // View Details Modal State
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewUser, setViewUser] = useState<any>(null);
    const [viewSessions, setViewSessions] = useState<any[]>([]);
    const [viewLoading, setViewLoading] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);

    useEffect(() => {
        loadUsers();
    }, [page]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const result = await window.api?.getAdminUsers(adminToken, page, 10, search);
            if (result?.ok) {
                setUsers(result.users || []);
                setTotalPages(result.pagination?.totalPages || 1);
            }
        } catch (e) {
            console.error("Failed to load users:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setPage(1);
        loadUsers();
    };

    const openBanModal = (userId: string) => {
        setBanUserId(userId);
        setBanReason("");
        setBanModalOpen(true);
    };

    const handleBan = async () => {
        if (!banUserId) return;
        setActionLoading(banUserId);
        try {
            const result = await window.api?.banUser(adminToken, banUserId, banReason);
            if (result?.ok) {
                setBanModalOpen(false);
                loadUsers();
            } else {
                alert(result?.error || t('ban_failed'));
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnban = async (userId: string) => {
        setActionLoading(userId);
        try {
            const result = await window.api?.unbanUser(adminToken, userId);
            if (result?.ok) {
                loadUsers();
            } else {
                alert(result?.error || t('unban_failed'));
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleToggleAdmin = async (userId: string) => {
        setActionLoading(userId);
        try {
            const result = await window.api?.toggleUserAdmin(adminToken, userId);
            if (result?.ok) {
                loadUsers();
            } else {
                alert(result?.error || t('toggle_admin_failed'));
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleAddUser = async () => {
        if (!newUserEmail || !newUserUsername || !newUserPassword) {
            setAddUserError(t('fill_all_info'));

            return;
        }

        setAddUserLoading(true);
        setAddUserError("");
        try {
            const result = await window.api?.createUser(adminToken, {
                email: newUserEmail,
                catidUsername: newUserUsername,
                password: newUserPassword,
                isAdmin: newUserIsAdmin,
            });
            if (result?.ok) {
                setAddModalOpen(false);
                setNewUserEmail("");
                setNewUserUsername("");
                setNewUserPassword("");
                setNewUserIsAdmin(false);
                loadUsers();
            } else {
                setAddUserError(result?.error || t('create_user_failed'));

            }
        } finally {
            setAddUserLoading(false);
        }
    };

    const openViewModal = async (userId: string) => {
        setViewModalOpen(true);
        setViewUser(null);
        setViewSessions([]);
        setViewLoading(true);
        setViewError(null);
        try {
            const result = await window.api?.getUserDetails(adminToken, userId);
            console.log("[Admin] getUserDetails result:", result);
            if (result?.ok) {
                setViewUser(result.user);
                setViewSessions(result.sessions || []);
            } else {
                setViewError(result?.error || t('load_failed'));

            }
        } catch (e: any) {
            console.error("Failed to load user details:", e);
            setViewError(e?.message || t('error_occurred'));

        } finally {
            setViewLoading(false);
        }
    };

    const inputStyle = {
        backgroundColor: colors.surface,
        color: colors.onSurface,
        border: `1px solid ${colors.outline}`,
    };

    return (
        <div className="rounded-xl p-5" style={{ backgroundColor: colors.surfaceContainer }}>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: colors.onSurface }}>
                <Icons.Person className="w-5 h-5" style={{ color: colors.secondary }} />
                {t('user_management')}
            </h3>

            {/* Search + Add User */}
            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder={t('search_username')}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                />
                <button onClick={handleSearch} className="px-4 py-2 rounded-lg" style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}>
                    <Icons.Search className="w-4 h-4" />
                </button>
                <button onClick={() => setAddModalOpen(true)} className="px-4 py-2 rounded-lg flex items-center gap-1" style={{ backgroundColor: "#22c55e", color: "#fff" }}>
                    <span>+</span> {t('add_user')}
                </button>
            </div>

            {/* User List */}
            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-4 w-32" colors={colors} />
                                    <Skeleton className="h-4 w-12 rounded" colors={colors} />
                                </div>
                                <Skeleton className="h-3 w-48" colors={colors} />
                            </div>
                            <div className="flex gap-1">
                                <Skeleton className="w-8 h-8 rounded-lg" colors={colors} />
                                <Skeleton className="w-8 h-8 rounded-lg" colors={colors} />
                                <Skeleton className="w-8 h-8 rounded-lg" colors={colors} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {users.length === 0 ? (
                        <p className="text-center py-4" style={{ color: colors.onSurfaceVariant }}>{t('no_users_found')}</p>
                    ) : (
                        users.map((user) => (
                            <div key={user.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span style={{ color: colors.onSurface }}>
                                            {user.minecraftUsername
                                                ? `${user.minecraftUsername} (${user.catidUsername})`
                                                : (user.catidUsername || user.email)
                                            }
                                        </span>
                                        {user.isAdmin && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{t('admin')}</span>}
                                        {user.isBanned && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{t('ban_user')}</span>}
                                    </div>
                                    <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{user.email}</p>
                                </div>
                                <div className="flex gap-1">
                                    {/* View Details */}
                                    <button onClick={() => openViewModal(user.id)} className="p-2 rounded-lg" style={{ backgroundColor: colors.surface }} title={t('view_details')}>
                                        <Icons.Info className="w-4 h-4" style={{ color: colors.onSurface }} />
                                    </button>
                                    {/* Toggle Admin */}
                                    <button
                                        onClick={() => handleToggleAdmin(user.id)}
                                        disabled={actionLoading === user.id}
                                        className="p-2 rounded-lg transition-opacity hover:opacity-80"
                                        style={{ backgroundColor: user.isAdmin ? colors.secondary : colors.surface }}
                                        title={user.isAdmin ? t('remove_admin') : t('grant_admin')}
                                    >
                                        {actionLoading === user.id ? (
                                            <Icons.Spinner className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Icons.Admin className="w-4 h-4" style={{ color: user.isAdmin ? colors.onPrimary : colors.onSurface }} />
                                        )}
                                    </button>
                                    {/* Ban/Unban */}
                                    {user.isBanned ? (
                                        <button onClick={() => handleUnban(user.id)} disabled={actionLoading === user.id} className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30" title={t('unban')}>
                                            <Icons.Check className="w-4 h-4 text-green-500" />
                                        </button>
                                    ) : (
                                        <button onClick={() => openBanModal(user.id)} disabled={actionLoading === user.id} className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30" title={t('ban_user')}>
                                            <Icons.Close className="w-4 h-4 text-red-500" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded" style={{ backgroundColor: colors.surface, color: colors.onSurface, opacity: page === 1 ? 0.5 : 1 }}>←</button>
                    <span style={{ color: colors.onSurfaceVariant }}>{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded" style={{ backgroundColor: colors.surface, color: colors.onSurface, opacity: page === totalPages ? 0.5 : 1 }}>→</button>
                </div>
            )}

            {/* Ban Reason Modal */}
            {banModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="rounded-xl p-6 w-full max-w-md mx-4" style={{ backgroundColor: colors.surfaceContainer }}>
                        <h3 className="text-lg font-bold mb-4" style={{ color: colors.onSurface }}>{t('ban_user_account')}</h3>
                        <input
                            type="text"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            placeholder={t('ban_reason_optional')}
                            className="w-full px-4 py-3 rounded-lg text-sm mb-4"
                            style={inputStyle}
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setBanModalOpen(false)} className="flex-1 py-2 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }}>{t('cancel')}</button>
                            <button onClick={handleBan} disabled={actionLoading !== null} className="flex-1 py-2 rounded-lg bg-red-500 text-white">{t('ban_account')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {addModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="rounded-xl p-6 w-full max-w-md mx-4" style={{ backgroundColor: colors.surfaceContainer }}>
                        <h3 className="text-lg font-bold mb-4" style={{ color: colors.onSurface }}>{t('add_new_user')}</h3>

                        {addUserError && <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-3 mb-4 text-sm">{addUserError}</div>}

                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>{t('email')}</label>
                                <input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder={t('email_placeholder')} />
                            </div>
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>{t('catid_username')}</label>
                                <input type="text" value={newUserUsername} onChange={(e) => setNewUserUsername(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder={t('username')} />
                            </div>
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>{t('password')}</label>
                                <input type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder={t('password_placeholder')} />
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="newUserAdmin" checked={newUserIsAdmin} onChange={(e) => setNewUserIsAdmin(e.target.checked)} className="w-4 h-4" />
                                <label htmlFor="newUserAdmin" className="text-sm" style={{ color: colors.onSurface }}>{t('set_as_admin')}</label>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => { setAddModalOpen(false); setAddUserError(""); }} className="flex-1 py-2 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }}>{t('cancel')}</button>
                            <button onClick={handleAddUser} disabled={addUserLoading} className="flex-1 py-2 rounded-lg" style={{ backgroundColor: "#22c55e", color: "#fff", opacity: addUserLoading ? 0.7 : 1 }}>
                                {addUserLoading ? t('creating') : t('create_user')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View User Details Modal */}
            {viewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" style={{ backgroundColor: colors.surfaceContainer }}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold" style={{ color: colors.onSurface }}>{t('user_details')}</h3>
                            <button onClick={() => setViewModalOpen(false)} className="p-1 rounded hover:opacity-70">
                                <Icons.Close className="w-5 h-5" style={{ color: colors.onSurface }} />
                            </button>
                        </div>

                        {viewLoading ? (
                            <div className="flex justify-center py-8">
                                <Icons.Spinner className="w-6 h-6 animate-spin" style={{ color: colors.secondary }} />
                            </div>
                        ) : viewError ? (
                            <div className="text-center py-8">
                                <p className="text-red-400 mb-2">{viewError}</p>
                                <button onClick={() => setViewModalOpen(false)} className="text-sm underline" style={{ color: colors.onSurfaceVariant }}>{t('close')}</button>
                            </div>
                        ) : viewUser ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                        <p style={{ color: colors.onSurfaceVariant }}>{t('catid_username')}</p>
                                        <p style={{ color: colors.onSurface }}>{viewUser.catidUsername || "-"}</p>
                                    </div>
                                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                        <p style={{ color: colors.onSurfaceVariant }}>{t('email')}</p>
                                        <p style={{ color: colors.onSurface }}>{viewUser.email}</p>
                                    </div>
                                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                        <p style={{ color: colors.onSurfaceVariant }}>{t('minecraft_username')}</p>
                                        <p style={{ color: colors.onSurface }}>{viewUser.minecraftUsername || "-"}</p>
                                    </div>
                                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                        <p style={{ color: colors.onSurfaceVariant }}>{t('status')}</p>
                                        <div className="flex gap-1">
                                            {viewUser.isAdmin && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{t('admin')}</span>}
                                            {viewUser.bannedAt ? <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{t('ban_user')}</span> : <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">{t('active')}</span>}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg col-span-2" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                        <p style={{ color: colors.onSurfaceVariant }}>{t('registered_at')}</p>
                                        <p style={{ color: colors.onSurface }}>{new Date(viewUser.createdAt).toLocaleString(language === "th" ? "th-TH" : "en-US")}</p>
                                    </div>
                                </div>

                                {viewSessions.length > 0 && (
                                    <div>
                                        <h4 className="font-medium mb-2" style={{ color: colors.onSurface }}>{t('sessions')} ({viewSessions.length})</h4>
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {viewSessions.map((session: any) => (
                                                <div key={session.id} className="text-xs p-2 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                                    <p style={{ color: colors.onSurface }}>{session.ipAddress || t('unknown_ip')}</p>
                                                    <p style={{ color: colors.onSurfaceVariant }}>{session.userAgent?.substring(0, 50)}...</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
