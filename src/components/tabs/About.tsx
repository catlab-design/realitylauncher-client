import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { useTranslation } from "../../hooks/useTranslation";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";

import rBackground from "../../assets/r_background.svg";

import rdcwLogo from "../../assets/rdcw_logo_transparent.webp";

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

export function About({ colors, config }: { colors: any; config?: { language?: "th" | "en" } }) {
    const { t } = useTranslation(config?.language);
    const containerRef = useRef<HTMLDivElement>(null);
    const [version, setVersion] = React.useState("v0.3.4");

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
        const ctx = gsap.context(() => {
            gsap.from(".fade-up", {
                y: 15,
                opacity: 0,
                duration: 0.6,
                stagger: 0.08,
                ease: "power2.out"
            });
        }, containerRef);

        // Fetch dynamic version
        (window as any).api.getAppVersion().then((v: string) => {
            setVersion(`v${v}`);
        }).catch(() => {
            setVersion("v0.3.4");
        });

        return () => ctx.revert();
    }, []);

    // Minimal Web Font Stack (Pro Stack)
    const fontStack = "'Inter', 'Prompt', sans-serif";

    return (
        <div
            ref={containerRef}
            className="h-full flex flex-col p-8 overflow-y-auto custom-scrollbar no-drag"
            style={{ fontFamily: fontStack }}
        >
            <div className="max-w-2xl mx-auto w-full space-y-10 pb-16">

                {/* Refined Horizontal Header */}
                <div className="fade-up flex items-center gap-6">
                    <img
                        src={rBackground.src}
                        alt="Reality"
                        className="w-14 h-14 rounded-2xl shadow-lg border border-white/10"
                    />
                    <div className="space-y-0.5">
                        <h1 className="text-2xl font-bold tracking-tight" style={{ color: colors.onSurface }}>Reality</h1>
                        <p className="text-[11px] uppercase tracking-[0.3em] font-black opacity-60" style={{ color: colors.onSurface }}>{version}</p>
                    </div>
                </div>

                {/* Minimal Mission */}
                <div className="fade-up relative">
                    <div className="absolute left-0 top-0 w-1.5 h-full rounded-full opacity-40" style={{ backgroundColor: colors.primary }} />
                    <div className="pl-8 space-y-3">
                        <p className="text-[12px] font-black uppercase opacity-60" style={{ color: colors.onSurface }}>{t('about_passion_title')}</p>
                        <p className="text-xl font-medium leading-relaxed tracking-tight" style={{ color: colors.onSurface }}
                            dangerouslySetInnerHTML={{ __html: t('about_passion_desc') }}
                        />
                    </div>
                </div>

                {/* Partners Section (Centered & Colored) */}
                <div className="fade-up space-y-12 py-4 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <h2 className="text-xs font-black uppercase opacity-50" style={{ color: colors.onSurface }}>{t('about_partners_title')}</h2>
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
                                className="h-12 w-auto drop-shadow-xl transition-all duration-500 group-hover:scale-105"
                            />
                            <div className="flex flex-col items-center gap-1 transition-all">
                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-all">
                                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.onSurface }}>Ren Dear Co(de) Working Studio</span>
                                    <Icons.ExternalLink className="w-2.5 h-2.5" />
                                </div>
                                <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest" style={{ color: colors.onSurface }}>{t('partner_special_thanks')}</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Team List (Detailed List) */}
                <div className="fade-up space-y-10">
                    <div className="flex items-center gap-5">
                        <h2 className="text-xs font-black uppercase opacity-50 whitespace-nowrap" style={{ color: colors.onSurface }}>{t('about_dev_team')}</h2>
                        <div className="flex-1 h-px opacity-20" style={{ backgroundColor: colors.onSurface }} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {TEAM.map((member) => (
                            <div
                                key={member.userGame}
                                className="group flex items-start gap-4 p-5 rounded-3xl border transition-all duration-300 hover:bg-white/4 bg-white/1"
                                style={{ borderColor: colors.outlineVariant || colors.outline }}
                            >
                                <div className="relative shrink-0">
                                    <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-700" style={{ backgroundColor: colors.primary + '20' }} />
                                    <MCHead
                                        username={member.userGame}
                                        size={48}
                                        className="relative rounded-xl shadow-md shrink-0 transition-all duration-500"
                                    />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <div className="flex flex-col">
                                        <h3 className="text-sm font-bold truncate" style={{ color: colors.onSurface }}>{member.name}</h3>
                                        <span className="text-[9px] font-bold opacity-30" style={{ color: colors.onSurface }}>
                                            @{member.userGame}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <p className="text-[10px] font-black opacity-80 uppercase tracking-wide" style={{ color: colors.secondary }}>{member.role}</p>
                                        {member.subRole && (
                                            <p className="text-[9px] font-bold opacity-40" style={{ color: colors.onSurface }}>{member.subRole}</p>
                                        )}
                                    </div>
                                    <p className="text-[11px] opacity-60 leading-snug max-w-full font-medium" style={{ color: colors.onSurface }}>
                                        {member.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Compact Footer Section */}
                <div className="fade-up pt-12 border-t flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: colors.outlineVariant || colors.outline }}>
                    <div className="flex items-center gap-6 opacity-50">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: colors.onSurface }}>{t('about_made_in')}</span>
                        <Icons.Heart className="w-3 h-3" style={{ fill: colors.secondary }} />
                    </div>
                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest" style={{ color: colors.onSurface }}>
                        {t('about_copyright')}
                    </p>
                </div>

            </div>
        </div>
    );
}
