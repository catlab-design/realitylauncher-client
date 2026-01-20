import type { AuthSession, LauncherConfig } from "../../../types/launcher";
import { Icons } from "../../ui/Icons";
import { MCHead } from "../../ui/MCHead";
import microsoftIcon from "../../../assets/microsoft_icon.svg";

export interface SettingsTabProps {
    config: LauncherConfig;
    updateConfig: (newConfig: Partial<LauncherConfig>) => void;
    colors: any;
}

export interface AccountTabProps extends SettingsTabProps {
    session: AuthSession | null;
    accounts: AuthSession[];
    handleLogout: () => void;
    selectAccount: (account: AuthSession) => void;
    removeAccount: (account: AuthSession) => void;
    setLoginDialogOpen: (open: boolean) => void;
    handleUnlink: (provider: "catid" | "microsoft") => void;
    setLinkCatIDOpen: (open: boolean) => void;
}

export function AccountTab({
    config,
    updateConfig,
    colors,
    session,
    accounts,
    handleLogout,
    selectAccount,
    removeAccount,
    setLoginDialogOpen,
    handleUnlink,
    setLinkCatIDOpen,
}: AccountTabProps) {
    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-user text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>บัญชีผู้ใช้</h3>
            </div>
            <div className="p-4 space-y-3">
                {/* Current Account */}
                {session ? (
                    <div className="p-3 rounded-xl space-y-4" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <div className="flex items-center gap-3">
                            <MCHead username={session.username} size={48} className="rounded-xl" />
                            <div className="flex-1">
                                <div className="font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
                                    {session.username}
                                    {session.isAdmin ? (
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                            <Icons.Check className="w-3 h-3 text-gray-900" />
                                        </span>
                                    ) : session.type === "catid" ? (
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#3b82f6" }}>
                                            <Icons.Check className="w-3 h-3 text-white" />
                                        </span>
                                    ) : session.type === "microsoft" ? (
                                        <>
                                            <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                                            {session.apiToken && (
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                                    <Icons.Check className="w-3 h-3 text-white" />
                                                </span>
                                            )}
                                        </>
                                    ) : null}
                                </div>
                                <div className="text-xs flex items-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                                    {session.type === "microsoft"
                                        ? (session.apiToken ? "บัญชี CatID และ Microsoft" : "บัญชี Microsoft")
                                        : session.type === "catid" ? "บัญชี CatID" : "โหมดออฟไลน์"}
                                </div>
                                {/* Session status for CatID accounts only (7 days from login) */}
                                {session.type === "catid" && (
                                    (() => {
                                        const now = Date.now();
                                        // CatID expires 7 days from createdAt
                                        const sevenDays = 7 * 24 * 60 * 60 * 1000;
                                        const createdAt = (session as any).createdAt || now;
                                        const expiresAt = createdAt + sevenDays;
                                        const isExpired = now > expiresAt;
                                        const timeRemaining = expiresAt - now;
                                        const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
                                        const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                        const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                                        const expiryDate = new Date(expiresAt).toLocaleString("th-TH", {
                                            dateStyle: "short",
                                            timeStyle: "short"
                                        });

                                        return (
                                            <div className="mt-1 text-xs" style={{ color: isExpired ? "#ef4444" : timeRemaining < 24 * 60 * 60 * 1000 ? "#f59e0b" : colors.onSurfaceVariant }}>
                                                {isExpired ? (
                                                    <span className="flex items-center gap-1">
                                                        <i className="fa-solid fa-exclamation-triangle" />
                                                        เซสชันหมดอายุ - กรุณาเข้าสู่ระบบใหม่
                                                    </span>
                                                ) : timeRemaining < 60 * 60 * 1000 ? (
                                                    <span className="flex items-center gap-1">
                                                        <i className="fa-solid fa-clock" />
                                                        ใกล้หมดอายุ: เหลือ {minutesRemaining} นาที
                                                    </span>
                                                ) : daysRemaining > 0 ? (
                                                    <span className="flex items-center gap-1">
                                                        <i className="fa-regular fa-clock" />
                                                        หมดอายุ: {expiryDate} (เหลือ {daysRemaining}ว. {hoursRemaining}ชม.)
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <i className="fa-regular fa-clock" />
                                                        หมดอายุ: {expiryDate} (เหลือ {hoursRemaining}ชม. {minutesRemaining}น.)
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-3 py-1.5 rounded-lg text-sm transition-all hover:scale-105"
                                style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                            >
                                ออกจากระบบ
                            </button>
                        </div>

                        {/* Linked Accounts Actions */}
                        {session.type === "microsoft" && (
                            <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: colors.outline + "20" }}>
                                <div className="text-xs font-medium" style={{ color: colors.onSurfaceVariant }}>การเชื่อมต่อบัญชี</div>
                                <div className="flex gap-2">
                                    {session.apiToken ? (
                                        <button
                                            onClick={() => handleUnlink("catid")}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-black/5"
                                            style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                                        >
                                            <Icons.Check className="w-4 h-4" style={{ color: colors.secondary }} />
                                            <span>ยกเลิกการเชื่อมต่อ CatID</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setLinkCatIDOpen(true)}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-black/5"
                                            style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                                        >
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                                <Icons.Check className="w-3.5 h-3.5 text-white" />
                                            </span>
                                            <span>เชื่อมต่อกับ CatID</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <Icons.Person className="w-10 h-10 mx-auto mb-2" style={{ color: colors.onSurfaceVariant }} />
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ยังไม่ได้เข้าสู่ระบบ</p>
                    </div>
                )}

                {/* Account Lists */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {accounts.map((acc, index) => {
                        const account = acc as AuthSession;
                        return (
                            <div
                                key={index}
                                onClick={() => selectAccount(acc)}
                                className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                                style={{
                                    backgroundColor: account.uuid === session?.uuid ? colors.secondary + "20" : "transparent",
                                    border: account.uuid === session?.uuid ? `1px solid ${colors.secondary}` : `1px solid ${colors.outline}20`
                                }}
                            >
                                <MCHead username={account.username} size={32} className="rounded-lg" />
                                <div className="flex-1">
                                    <div className="text-sm font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
                                        {account.username}
                                        {account.isAdmin ? (
                                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                <Icons.Check className="w-2.5 h-2.5 text-gray-900" />
                                            </span>
                                        ) : account.type === "catid" ? (
                                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                                                <Icons.Check className="w-2.5 h-2.5 text-white" />
                                            </span>
                                        ) : account.type === "microsoft" ? (
                                            <>
                                                <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                                                {account.apiToken && (
                                                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                        <Icons.Check className="w-2.5 h-2.5 text-white" />
                                                    </span>
                                                )}
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="text-xs flex items-center gap-1" style={{ color: colors.onSurfaceVariant }}>
                                        {account.type === "microsoft"
                                            ? (account.apiToken ? "บัญชี CatID และ Microsoft" : "บัญชี Microsoft")
                                            : account.type === "catid" ? "บัญชี CatID" : "โหมดออฟไลน์"}
                                        {/* Show expired warning for CatID accounts only */}
                                        {account.type === "catid" && (() => {
                                            const sevenDays = 7 * 24 * 60 * 60 * 1000;
                                            const createdAt = (account as any).createdAt || Date.now();
                                            const expiresAt = createdAt + sevenDays;
                                            const isExpired = Date.now() > expiresAt;
                                            return isExpired ? (
                                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#ef444420", color: "#ef4444" }}>
                                                    หมดอายุ
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                                {account.uuid !== session?.uuid && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeAccount(account);
                                        }}
                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-500 hover:text-white"
                                        style={{ color: colors.onSurfaceVariant }}
                                    >
                                        <i className="fa-solid fa-trash text-xs"></i>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    onClick={() => setLoginDialogOpen(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-medium border border-dashed transition-all hover:bg-opacity-10"
                    style={{
                        borderColor: colors.secondary,
                        color: colors.secondary,
                    }}
                >
                    <i className="fa-solid fa-plus mr-2"></i>
                    เพิ่มบัญชีใหม่
                </button>
            </div>
        </div>
    );
}
