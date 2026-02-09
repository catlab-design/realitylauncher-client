import { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import './JoinInstanceDialog.css'; // Keeping for animations

interface JoinInstanceDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialKey?: string;
    colors?: any;
}

export function JoinInstanceDialog({ isOpen, onClose, onSuccess, initialKey = '', colors }: JoinInstanceDialogProps) {
    const [key, setKey] = useState(initialKey);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Fallback colors if not provided
    const bg = colors?.surface || '#1e1e2e';
    const text = colors?.onSurface || '#ffffff';
    const primary = colors?.primary || '#3b82f6';
    const onPrimary = colors?.onPrimary || '#ffffff';
    const surfaceContainer = colors?.surfaceContainer || '#181825';
    const surfaceHighest = colors?.surfaceContainerHighest || '#313244';
    const danger = '#ef4444';
    const successColor = '#22c55e';

    // Update key when initialKey prop changes
    useEffect(() => {
        if (initialKey) {
            setKey(initialKey);
        }
    }, [initialKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!key.trim()) {
            setError('กรุณาใส่รหัสเชิญ (Invite Key)');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess(false);

        try {
            const result = await window.api?.instanceJoin?.(key.trim());

            if (result?.ok) {
                setSuccess(true);
                setError('');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                    setKey('');
                    setSuccess(false);
                }, 1500);
            } else {
                let errMsg = typeof result?.error === 'string' ? result.error : 'ไม่สามารถเข้าร่วม instance ได้';
                if (errMsg.includes("API token") || errMsg.includes("Unauthorized") || errMsg.includes("No token")) {
                    errMsg = "ไม่มี CatID กรุณาสมัครหรือเข้าสู่ระบบ";
                }
                setError(errMsg);
            }
        } catch (err: any) {
            setError(err.message || 'เกิดข้อผิดพลาดในการเข้าร่วม');
        }

        setLoading(false);
    };

    const handleClose = () => {
        if (!loading) {
            setKey('');
            setError('');
            setSuccess(false);
            onClose();
        }
    };

    const formatKey = (value: string) => {
        // Remove all non-alphanumeric characters (except dashes)
        const cleaned = value.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
        return cleaned;
    };

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatKey(e.target.value);
        setKey(formatted);
        setError('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300" onClick={handleClose}>
            <div
                className="flex w-full max-w-3xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.5)] overflow-hidden animate-in slide-in-from-bottom-8 duration-500 relative border border-white/10"
                style={{ backgroundColor: bg, color: text }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left Branding Side */}
                <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${primary}10` }}>
                    {/* Background visual elements */}
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                    <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-yellow-500/5 blur-[60px] rounded-full pointer-events-none" />

                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10 animate-in zoom-in duration-700" style={{ backgroundColor: primary }}>
                        <Icons.Key className="w-10 h-10" style={{ color: onPrimary }} />
                    </div>

                    <h2 className="text-2xl font-black tracking-tighter text-center z-10">เข้าร่วมเกม</h2>
                    <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors?.secondary || '#fbbf24' }}>รหัสเชิญ</div>

                    <p className="mt-12 text-xs font-bold opacity-30 text-center leading-relaxed z-10">
                        ระบุรหัสเชิญเฉพาะของคุณ<br />เพื่อเข้าถึง Instance นี้
                    </p>
                </div>

                {/* Right Form Side */}
                <div className="flex-1 p-10 flex flex-col relative">
                    {/* Header/Close */}
                    <div className="absolute top-6 right-6 z-20">
                        <button
                            onClick={handleClose}
                            disabled={loading}
                            className="p-2.5 rounded-full hover:bg-white/10 transition-colors opacity-40 hover:opacity-100 disabled:opacity-20"
                        >
                            <Icons.Close className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-3xl font-black tracking-tight mb-2">เข้าร่วม Instance</h3>
                        <p className="text-sm font-medium opacity-60">ระบุรหัสเชิญเพื่อเริ่มต้นการเดินทางของคุณ</p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                        <div className="space-y-6 flex-1">
                            {/* Info Box */}
                            <div className="flex gap-4 p-5 rounded-2xl transition-all border border-white/5" style={{ backgroundColor: surfaceContainer }}>
                                <div className="shrink-0">
                                    <Icons.Info className="w-6 h-6 text-blue-400" />
                                </div>
                                <p className="text-xs font-medium opacity-70 leading-relaxed pt-0.5">
                                    รหัสเชิญ (Invite Key) จะช่วยให้คุณเข้าถึงเซิร์ฟเวอร์หรือกลุ่มที่ต้องการเล่นร่วมกับเพื่อนของคุณ
                                </p>
                            </div>

                            {/* Input Field */}
                            <div className="space-y-2.5">
                                <label htmlFor="instance-key" className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-widest">
                                    รหัสเชิญของคุณ
                                </label>
                                <div className="relative group">
                                    <input
                                        id="instance-key"
                                        type="text"
                                        className="w-full px-6 py-5 pl-16 rounded-2xl outline-none border-2 transition-all font-mono text-xl tracking-[0.25em] font-black uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-sans focus:ring-8"
                                        style={{
                                            backgroundColor: surfaceHighest,
                                            borderColor: error ? danger : success ? successColor : 'transparent',
                                            color: text,
                                            '--tw-ring-color': `${primary}10`
                                        } as any}
                                        placeholder="วางรหัสเชิญที่นี่..."
                                        value={key}
                                        onChange={handleKeyChange}
                                        disabled={loading || success}
                                        maxLength={32}
                                        autoFocus
                                    />
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-30 group-focus-within:opacity-100 group-focus-within:text-yellow-500 transition-all">
                                        <Icons.Key className="w-6 h-6" />
                                    </div>
                                </div>

                                {/* Feedback Messages */}
                                <div className="min-h-[24px] px-1">
                                    {error && (
                                        <div className="flex items-center gap-2 text-sm font-bold text-red-400 animate-in fade-in slide-in-from-top-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                            <span>{error}</span>
                                        </div>
                                    )}
                                    {success && (
                                        <div className="flex items-center gap-2 text-sm font-black text-green-400 animate-in fade-in slide-in-from-top-1">
                                            <Icons.Check className="w-4 h-4" />
                                            <span>เข้าร่วมสำเร็จแล้ว!</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 mt-8">
                            <button
                                type="submit"
                                disabled={loading || !key.trim() || success}
                                className="flex-[2] py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:transform-none shadow-2xl hover:brightness-110 group"
                                style={{
                                    backgroundColor: success ? successColor : primary,
                                    color: onPrimary,
                                    boxShadow: success ? `0 20px 40px ${successColor}30` : `0 20px 40px ${primary}30`
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Icons.Spinner className="w-6 h-6 animate-spin" />
                                        <span>กำลังตรวจสอบ...</span>
                                    </>
                                ) : success ? (
                                    <>
                                        <Icons.Check className="w-6 h-6" />
                                        <span>ยืนยันแล้ว</span>
                                    </>
                                ) : (
                                    <>
                                        <span>เข้าร่วมทันที</span>
                                        <Icons.Login className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={loading}
                                className="flex-1 py-4 rounded-2xl font-bold transition-all hover:bg-white/5 active:scale-[0.98] disabled:opacity-30 border-2 border-white/5"
                                style={{ color: text }}
                            >
                                ยกเลิก
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
