import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "../../hooks/useTranslation";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";
import { useMotionPreset } from "../../lib/motion";
import rLogo from "../../assets/r.png";

import rdcwLogo from "../../assets/rdcw_logo_transparent.webp";
import blueMemoryLogo from "../../assets/icon.webp";

interface Partner {
    id: string;
    name: string;
    slug: string;
    role: string;
    roleTh?: string | null;
    roleJp?: string | null;
    imageUrl: string;
    websiteUrl?: string | null;
    socials?: string | null;
    displayOrder: number;
}

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
        role: "CEO & ผู้ก่อตั้ง CatLab_",
        subRole: "Designer / Developer",
        description: "ออกแบบประสบการณ์ผู้ใช้ และพัฒนาระบบของ Reality"
    },
    {
        name: "Jo",
        userGame: "Kjofex2",
        role: "Co-CEO CatLab_",
        description: "ร่วมวางแผนและขับเคลื่อนโปรเจกต์"
    },
    {
        name: "Pumpkins",
        userGame: "notpumpkins",
        role: "IT Department",
        description: "รับผิดชอบการพัฒนาและฟีเจอร์ของระบบ"
    },
];

const BackgroundDecorations = ({ colors }: { colors: any }) => {
    return null;
};

export function About({ colors, config }: { colors: any; config?: { language?: "th" | "en" } }) {
    const { t } = useTranslation(config?.language);
    const containerRef = useRef<HTMLDivElement>(null);
    const [version, setVersion] = React.useState("v0.3.5");
    const [partners, setPartners] = React.useState<Partner[]>(() => {
        try {
            const cached = localStorage.getItem("cached_partners");
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        const API_URL = (window as any).API_URL || "https://api.reality.catlabdesign.space";
        fetch(`${API_URL}/partners?t=${Date.now()}`)
            .then(res => res.ok ? res.json() : Promise.reject("Status not OK"))
            .then(data => {
                if (Array.isArray(data)) {
                    setPartners(data);
                    localStorage.setItem("cached_partners", JSON.stringify(data));
                }
            })
            .catch(err => console.error("Failed to fetch partners:", err));
    }, []);

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
            userGame: "notpumpkins",
            role: t('role_it'),
            description: t('desc_pumpkins')
        },
    ];

    useEffect(() => {
        (window as any).api?.getAppVersion()?.then((v: string) => {
            setVersion(`v${v}`);
        }).catch(() => {
            setVersion("v0.3.5");
        });
    }, []);

    const fontStack = "'Inter', 'Prompt', sans-serif";

    // Shared presets: quick section stagger, no up-front delay, reduced-motion aware.
    const m = useMotionPreset();
    const containerVariants = m.staggerContainer(0.06);
    const itemVariants = m.fadeUp;

    return (
        <div
            ref={containerRef}
            className="relative h-full flex flex-col p-8 overflow-y-auto custom-scrollbar no-drag"
            style={{ fontFamily: fontStack, backgroundColor: "transparent" }}
        >
            <BackgroundDecorations colors={colors} />

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="max-w-3xl mx-auto w-full space-y-16 pb-24"
            >
                <motion.div variants={itemVariants} className="flex items-center gap-6 pt-4">
                    <img
                        src={rLogo}
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

                <motion.div variants={itemVariants} className="relative">
                    <div className="absolute left-0 top-0 w-1.5 h-full rounded-full opacity-40" style={{ backgroundColor: colors.primary }} />
                    <div className="pl-8 space-y-3">
                        <p className="text-[12px] font-black uppercase opacity-60" style={{ color: colors.onSurface }}>{t('about_passion_title')}</p>
                        <p className="text-xl font-medium leading-relaxed tracking-tight" style={{ color: colors.onSurface }}
                            dangerouslySetInnerHTML={{ __html: t('about_passion_desc') }}
                        />
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-12 py-4 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <h2 className="text-xs font-black uppercase opacity-50 tracking-widest" style={{ color: colors.onSurface }}>{t('about_partners_title')}</h2>
                        <div className="w-12 h-1 rounded-full opacity-30" style={{ backgroundColor: colors.primary }} />
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-10 px-2 text-center">
                        {partners.length === 0 ? (
                            <p className="text-xs opacity-40 italic" style={{ color: colors.onSurface }}>
                                {t('common.no_data') || 'No partners'}
                            </p>
                        ) : (
                            partners.map((partner) => {
                                const handlePartnerClick = () => {
                                    const url = partner.websiteUrl || (partner.socials ? JSON.parse(partner.socials)?.[0]?.link : null);
                                    if (url) {
                                        (window as any).api?.openExternal(url);
                                    }
                                };
                                const roleText = config?.language === "th" ? (partner.roleTh || partner.role) : (config?.language === "jp" ? (partner.roleJp || partner.role) : partner.role);
                                return (
                                    <motion.div
                                        key={partner.id}
                                        className="group flex flex-col items-center gap-4 cursor-pointer"
                                        onClick={handlePartnerClick}
                                        {...m.hoverLift}
                                    >
                                        <img
                                            src={partner.imageUrl}
                                            alt={partner.name}
                                            className="h-12 w-auto transition-transform duration-300 group-hover:scale-110 object-contain rounded-[10px]"
                                        />
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.onSurface }}>
                                                    {partner.name}
                                                </span>
                                                <Icons.ExternalLink className="w-2.5 h-2.5" />
                                            </div>
                                            <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest" style={{ color: colors.onSurface }}>
                                                {roleText}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </motion.div>

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
                                {...m.hoverLift}
                                className="group relative flex items-start gap-4 p-5 rounded-3xl border border-white/5 bg-white/2 hover:bg-(--card-hover) transition-colors duration-300"
                                style={{ borderColor: colors.outlineVariant || colors.outline, "--card-hover": colors.onSurface + '04' } as React.CSSProperties}
                            >
                                <div className="shrink-0 relative">
                                    <div
                                        className="absolute inset-0 blur-lg rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-300"
                                        style={{ backgroundColor: colors.primary }}
                                    />
                                    <MCHead
                                        username={member.userGame}
                                        size={52}
                                        className="relative rounded-full ring-2 ring-white/5 group-hover:ring-primary/40 transition-shadow duration-300"
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
                            {...m.hoverScale}
                            onClick={() => (window as any).api.openExternal('https://discord.com/invite/PewhYEehFQ')}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/3 border border-white/5 hover:bg-white/8 transition-colors"
                            style={{ color: colors.onSurface }}
                        >
                            <Icons.Discord className="w-5 h-5" />
                            <span className="text-xs font-bold uppercase tracking-wider">Discord</span>
                        </motion.button>
                        
                        <motion.button
                            {...m.hoverScale}
                            onClick={() => (window as any).api.openExternal('https://gitlab.com/catlab-design/realitylauncher/realitylauncher-client')}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/3 border border-white/5 hover:bg-white/8 transition-colors"
                            style={{ color: colors.onSurface }}
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.405.875.875 0 0 0-1 .054.875.875 0 0 0-.29.44L16.47 7.818H7.537L5.332 1.07a.857.857 0 0 0-.29-.441.875.875 0 0 0-1-.054.859.859 0 0 0-.336.405L.433 9.502.4 9.588a6.066 6.066 0 0 0 2.012 7.01l.011.009.03.021 4.977 3.727 2.462 1.863 1.5 1.132a1.009 1.009 0 0 0 1.22 0l1.499-1.132 2.462-1.863 5.006-3.749.013-.01a6.068 6.068 0 0 0 2.01-7.003z"/></svg>
                            <span className="text-xs font-bold uppercase tracking-wider">GitLab</span>
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
