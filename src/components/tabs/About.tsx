import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "../../hooks/useTranslation";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";

import rBackground from "../../assets/r_background.svg";
import rdcwLogo from "../../assets/rdcw_logo_transparent.webp";
import blueMemoryLogo from "../../assets/icon.webp";

interface TeamMember {
    name: string;
    userGame: string;
    role: string;
    subRole?: string;
    description: string;
}

const TEAM: TeamMember[] = [
    {
        name: "Sam_Su",
        userGame: "Sam_Su",
        role: "CEO & ผู้ก่อตั้ง Q-Team",
        subRole: "Designer / Developer",
        description: "ออกแบบประสบการณ์ผู้ใช้ และพัฒนาระบบของ Reality"
    },
    {
        name: "Jo",
        userGame: "Kjofex2",
        role: "Co-CEO Q-Team",
        description: "ร่วมวางแผนและขับเคลื่อนโปรเจกต์"
    },
    {
        name: "Pumpkins",
        userGame: "realnice_k",
        role: "IT Department",
        description: "รับผิดชอบการพัฒนาและฟีเจอร์ของระบบ"
    },
    {
        name: "MrPeachs",
        userGame: "MrPeachs",
        role: "IT Department & Staff",
        description: "ผู้ช่วยด้านเทคนิค และสนับสนุนการทำงานของทีม"
    }
];

const BackgroundDecorations = ({ colors }: { colors: any }) => {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 opacity-30">
            <motion.div
                animate={{
                    x: [0, 50, -30, 0],
                    y: [0, -40, 60, 0],
                    scale: [1, 1.2, 0.9, 1],
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "linear"
                }}
                className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] blur-[120px] rounded-full opacity-60"
                style={{ backgroundColor: colors.primary }}
            />
            <motion.div
                animate={{
                    x: [0, -60, 40, 0],
                    y: [0, 80, -50, 0],
                    scale: [1, 1.1, 1.3, 1],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear"
                }}
                className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] blur-[150px] rounded-full opacity-40"
                style={{ backgroundColor: colors.secondary || colors.primary }}
            />
        </div>
    );
};

export function About({ colors, config }: { colors: any; config?: { language?: "th" | "en" } }) {
    const { t } = useTranslation(config?.language);
    const containerRef = useRef<HTMLDivElement>(null);
    const [version, setVersion] = React.useState("v0.3.5");

    const TEAM: TeamMember[] = [
        {
            name: "Sam_Su",
            userGame: "Sam_Su",
            role: t('role_ceo_founder'),
            subRole: t('role_designer_dev'),
            description: t('desc_sam_su')
        },
        {
            name: "Jo",
            userGame: "Kjofex2",
            role: t('role_co_ceo'),
            description: t('desc_jo')
        },
        {
            name: "Pumpkins",
            userGame: "realnice_k",
            role: t('role_it'),
            description: t('desc_pumpkins')
        },
        {
            name: "MrPeachs",
            userGame: "MrPeachs",
            role: t('role_it_staff'),
            description: t('desc_mrpeachs')
        }
    ];

    useEffect(() => {
        // Fetch dynamic version
        (window as any).api?.getAppVersion()?.then((v: string) => {
            setVersion(`v${v}`);
        }).catch(() => {
            setVersion("v0.3.5");
        });
    }, []);

    // Minimal Web Font Stack
    const fontStack = "'Inter', 'Prompt', sans-serif";

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { 
            y: 0, 
            opacity: 1,
            transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative h-full flex flex-col p-8 overflow-y-auto custom-scrollbar no-drag"
            style={{ fontFamily: fontStack, backgroundColor: colors.surface }}
        >
            <BackgroundDecorations colors={colors} />

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="max-w-3xl mx-auto w-full space-y-16 pb-24"
            >
                {/* Original Horizontal Header */}
                <motion.div variants={itemVariants} className="flex items-center gap-6 pt-4">
                    <img
                        src={rBackground.src}
                        alt="Reality"
                        className="w-14 h-14 rounded-2xl border border-white/10"
                    />
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold tracking-tight" style={{ color: colors.onSurface }}>
                            Reality <span className="italic" style={{ color: colors.primary }}>Launcher</span>
                        </h1>
                        <p className="text-[11px] uppercase tracking-[0.3em] font-black opacity-60" style={{ color: colors.onSurface }}>{version}</p>
                    </div>
                </motion.div>

                {/* Original Mission Style */}
                <motion.div variants={itemVariants} className="relative">
                    <div className="absolute left-0 top-0 w-1.5 h-full rounded-full opacity-40" style={{ backgroundColor: colors.primary }} />
                    <div className="pl-8 space-y-3">
                        <p className="text-[12px] font-black uppercase opacity-60" style={{ color: colors.onSurface }}>{t('about_passion_title')}</p>
                        <p className="text-xl font-medium leading-relaxed tracking-tight" style={{ color: colors.onSurface }}
                            dangerouslySetInnerHTML={{ __html: t('about_passion_desc') }}
                        />
                    </div>
                </motion.div>

                {/* Partners Section (Reverted to original look) */}
                <motion.div variants={itemVariants} className="space-y-12 py-4 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <h2 className="text-xs font-black uppercase opacity-50 tracking-widest" style={{ color: colors.onSurface }}>{t('about_partners_title')}</h2>
                        <div className="w-12 h-1 rounded-full opacity-30" style={{ backgroundColor: colors.primary }} />
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-10 px-2 text-center">
                        {/* RDCW */}
                        <div
                            className="group flex flex-col items-center gap-4 cursor-pointer"
                            onClick={() => (window as any).api.openExternal('https://rdcw.co.th/')}
                        >
                            <img
                                src={rdcwLogo.src}
                                alt="RDCW"
                                className="h-12 w-auto transition-all duration-500 group-hover:scale-110"
                            />
                            <div className="flex flex-col items-center gap-1 transition-all">
                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-all">
                                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.onSurface }}>Ren Dear Co(de) Working Studio</span>
                                    <Icons.ExternalLink className="w-2.5 h-2.5" />
                                </div>
                                <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest" style={{ color: colors.onSurface }}>{t('partner_special_thanks')}</span>
                            </div>
                        </div>

                        {/* Blue Memory */}
                        <div
                            className="group flex flex-col items-center gap-4 cursor-pointer"
                            onClick={() => (window as any).api.openExternal('https://www.tiktok.com/@bluememory_project')}
                        >
                            <img
                                src={blueMemoryLogo.src}
                                alt="Blue Memory"
                                className="h-12 w-auto transition-all duration-500 group-hover:scale-110 rounded-[10px] border border-white/10"
                            />
                            <div className="flex flex-col items-center gap-1 transition-all">
                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-all">
                                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.onSurface }}>Blue Memory</span>
                                    <Icons.ExternalLink className="w-2.5 h-2.5" />
                                </div>
                                <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest" style={{ color: colors.onSurface }}>{t('alliance')}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Team Section */}
                <motion.div variants={itemVariants} className="space-y-8">
                    <div className="flex items-center gap-4 px-4">
                        <h2 className="text-xs font-black uppercase opacity-50 tracking-widest whitespace-nowrap" style={{ color: colors.onSurface }}>
                            {t('about_dev_team')}
                        </h2>
                        <div className="h-px w-full opacity-20" style={{ backgroundColor: colors.onSurface }} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {TEAM.map((member) => (
                            <motion.div
                                key={member.userGame}
                                whileHover={{ scale: 1.02, backgroundColor: colors.onSurface + '04' }}
                                className="group relative flex items-start gap-4 p-5 rounded-[24px] border border-white/5 bg-white/2 transition-all duration-500"
                                style={{ borderColor: colors.outlineVariant || colors.outline }}
                            >
                                <div className="shrink-0 relative">
                                    <div 
                                        className="absolute inset-0 blur-lg rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-700"
                                        style={{ backgroundColor: colors.primary }}
                                    />
                                    <MCHead
                                        username={member.userGame}
                                        size={52}
                                        className="relative ring-2 ring-white/5 group-hover:ring-primary/40 transition-all duration-500"
                                    />
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                    <div className="flex flex-col">
                                        <h3 className="text-[15px] font-bold truncate" style={{ color: colors.onSurface }}>{member.name}</h3>
                                        <span className="text-[10px] font-black opacity-30 uppercase tracking-tighter" style={{ color: colors.onSurface }}>
                                            @{member.userGame}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.primary }}>{member.role}</p>
                                        {member.subRole && (
                                            <p className="text-[10px] font-bold opacity-40 leading-none" style={{ color: colors.onSurface }}>{member.subRole}</p>
                                        )}
                                    </div>
                                    <p className="text-[11px] opacity-60 leading-[1.4] max-w-full font-medium" style={{ color: colors.onSurface }}>
                                        {member.description}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* Footer Section */}
                <motion.div 
                    variants={itemVariants} 
                    className="pt-12 border-t flex flex-col items-center justify-between gap-6" 
                    style={{ borderColor: colors.outlineVariant || colors.outline }}
                >
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2 group cursor-help">
                            <Icons.Heart 
                                className="w-5 h-5 transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12" 
                                style={{ color: colors.primary }} 
                            />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.onSurface }}>
                                {t('about_made_in')}
                            </span>
                        </div>

                        <div className="h-4 w-px bg-white/10" />

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => (window as any).api.openExternal('https://discord.com/invite/PewhYEehFQ')}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/3 border border-white/5 hover:bg-white/8 transition-all"
                            style={{ color: colors.onSurface }}
                        >
                            <Icons.Discord className="w-5 h-5" />
                            <span className="text-xs font-bold uppercase tracking-wider">Discord</span>
                        </motion.button>
                        
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => (window as any).api.openExternal('https://github.com/catlab-design/realitylauncher-client')}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/3 border border-white/5 hover:bg-white/8 transition-all"
                            style={{ color: colors.onSurface }}
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
                            <span className="text-xs font-bold uppercase tracking-wider">GitHub</span>
                        </motion.button>
                    </div>
                    
                    <p className="text-[9px] font-bold opacity-30 uppercase tracking-[0.3em]" style={{ color: colors.onSurface }}>
                        {t('about_copyright')}
                    </p>
                </motion.div>
            </motion.div>
        </div>
    );
}
