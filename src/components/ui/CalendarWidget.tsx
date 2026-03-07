import React, { useState, useEffect } from "react";
import { Icons } from "./Icons";
import bannerImage from "../../assets/banner.png";

interface CalendarWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    colors: {
        surface: string;
        surfaceContainer: string;
        onSurface: string;
        onSurfaceVariant: string;
        outline: string;
        primary: string;
        secondary: string;
    };
    language: "th" | "en";
    instanceId?: string;
    instanceName?: string;
    preFetchedAgendas?: any[];
    isPreLoading?: boolean;
    onRefresh?: () => void;
}

let lastMessageIndex = -1;

// Helper: generate consistent YYYY-MM-DD date key
const getDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const RANDOM_MESSAGES = {
    th: [
        "ยินดีต้อนรับกลับมา!",
        "พร้อมที่จะเล่นหรือยัง?",
        "อย่าลืมตรวจสอบกิจกรรมล่าสุดในเซิร์ฟเวอร์นะ!",
        "วันนี้อากาศดีเหมาะกับการผจญภัยที่สุด!",
        "เพื่อนๆ ของคุณกำลังรออยู่ในโลก Reality!",
        "มีกำหนดการใหม่เพิ่มเข้ามา ลองเช็คดูสิ!",
        "ขอให้เป็นวันที่ดีและสนุกกับการเล่นนะ!",
        "คุณคือฮีโร่ในโลกใบนี้เสมอ!",
        "พร้อมสำหรับการผจญภัยครั้งใหม่หรือยัง?",
        "ออกไปแตะหญ้าบ้างนะ",
        "ขอบคุณที่แตะฉัน",
        "วันนี้ก็ยังหายใจอยู่สินะ",
        "วันนี้คุณเก่งทำหน้าที่ได้ดีมากแล้ว",
        "อย่าลืมกินข้าวนะ",
        "ทำงานหนักไปหรือเปล่า",
        "พักสายตาบ้างนะ",
        "พรุ่งนี้ก็เป็นวันที่ดีเหมือนกัน"
    ],
    en: [
        "Welcome back! Ready to play?",
        "Don't forget to check the latest events!",
        "It's a great day for an adventure!",
        "Your friends are waiting in Reality!",
        "New schedules added, check them out!",
        "Have a great day and enjoy playing!",
        "You're always a hero in this world!",
        "Ready for a new adventure?",
        "Is the world ending?",
        "Go get some sleep.",
        "This too shall pass.",
        "Keep fighting.",
        "Love yourself properly.",
        "You did great today."
    ]
};



// Helper: Individual agenda item component to reduce nesting complexity
function AgendaItem({ 
    item, 
    isFull, 
    isSelected, 
    onClick, 
    colors, 
    language 
}: { 
    item: any, 
    isFull: boolean, 
    isSelected: boolean, 
    onClick: () => void,
    colors: any,
    language: string
}) {
    return (
        <div 
            onClick={onClick} 
            className={`flex ${isFull ? 'gap-3 py-4 px-4' : 'gap-4 py-3 px-3'} cursor-pointer rounded-2xl transition-all ${isSelected ? (colors.surface === '#ffffff' ? 'bg-black/5' : 'bg-white/5') : 'hover:bg-black/5'}`}
        >
            <div className={`${isFull ? 'w-10' : 'w-14'} shrink-0 text-right flex flex-col justify-center leading-tight`}>
                <div className={`${isFull ? 'text-sm' : 'text-xs'} font-black opacity-80`} style={{ color: colors.onSurface }}>{item.time}</div>
                {item.endTime && (
                    <div className={`${isFull ? 'text-[10px]' : 'text-[10px]'} font-bold opacity-30`} style={{ color: colors.onSurface }}>
                        {item.endTime}
                    </div>
                )}
            </div>
            <div className={`${isFull ? 'w-1' : 'w-1'} self-stretch rounded-full`} style={{ backgroundColor: item.color || '#3b82f6' }} />
            <div className="flex-1 min-w-0">
                <div className={`flex items-start ${isFull ? 'gap-4' : 'gap-3'}`}>
                    {item.instanceIconUrl && <img src={item.instanceIconUrl} alt="" className={`${isFull ? 'w-10 h-10 rounded-xl' : 'w-7 h-7 rounded-lg'} object-cover`} />}
                    <div className="flex-1 min-w-0">
                        <h4 className={`${isFull ? 'text-lg' : 'text-xs'} font-black truncate -mt-0.5`} style={{ color: colors.onSurface }}>{item.title}</h4>
                        <div className={`${isFull ? 'text-xs' : 'text-[10px]'} font-black opacity-40 mt-0.5 line-clamp-1`} style={{ color: colors.onSurface }}>
                            {item.location || item.instanceName || (language === 'th' ? 'เซิร์ฟเวอร์หลัก' : 'Main Server')}
                        </div>
                        
                        {isSelected && (
                            <div className={`${isFull ? 'mt-3 pt-3' : 'mt-2 pt-2'} border-t border-black/5 animate-in slide-in-from-top-2`}>
                                {item.description && (
                                    <div className={`${isFull ? 'text-xs' : 'text-[10px]'} font-medium leading-relaxed opacity-60 mb-2`} style={{ color: colors.onSurface }}>
                                        {item.description}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {item.instanceName && (
                                        <div className={`${isFull ? 'text-[9px]' : 'text-[8px]'} font-black text-blue-500 uppercase tracking-widest`}>
                                            {item.instanceName}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function CalendarWidget({ 
    isOpen, 
    onClose, 
    colors, 
    language, 
    instanceId, 
    instanceName,
    preFetchedAgendas,
    isPreLoading,
    onRefresh
}: CalendarWidgetProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [agendas, setAgendas] = useState<any[]>(preFetchedAgendas || []);
    const [isLoadingAgendas, setIsLoadingAgendas] = useState(isPreLoading || false);
    const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null);
    const [randomStatus, setRandomStatus] = useState("");

    // Select random status message on mount
    useEffect(() => {
        const msgs = language === 'th' ? RANDOM_MESSAGES.th : RANDOM_MESSAGES.en;
        let index;
        do {
            index = Math.floor(Math.random() * msgs.length);
        } while (index === lastMessageIndex && msgs.length > 1);
        
        lastMessageIndex = index;
        setRandomStatus(msgs[index]);
    }, [language, isOpen]); // Also refresh when opened

    // Sync with pre-fetched data if provided
    useEffect(() => {
        if (preFetchedAgendas && !instanceId) {
            setAgendas(preFetchedAgendas);
            setIsLoadingAgendas(isPreLoading || false);
        }
    }, [preFetchedAgendas, isPreLoading, instanceId]);


    // Fetch real agendas if instanceId is provided
    useEffect(() => {
        // Only fetch if we have an instanceId or if pre-fetched data wasn't provided for global view
        if (!instanceId && preFetchedAgendas) return;

        if (instanceId) {
            setIsLoadingAgendas(true);
            (window as any).api?.fetchInstanceAgendas?.(instanceId)
                .then((res: any) => {
                    if (res && res.ok) {
                        setAgendas(res.agendas || []);
                    }
                })
                .finally(() => setIsLoadingAgendas(false));
        } else if (!preFetchedAgendas) {
            setIsLoadingAgendas(true);
            (window as any).api?.fetchAllAgendas?.()
                .then((res: any) => {
                    if (res && res.ok) {
                        setAgendas(res.agendas || []);
                    }
                })
                .finally(() => setIsLoadingAgendas(false));
        }
    }, [instanceId, preFetchedAgendas]);

    // Helper to get agendas for a specific date
    const getAgendasForDate = (date: Date) => {
        const dayOfWeek = date.getDay();
        const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD

        return agendas.filter(item => {
            // Recurring items (dayOfWeek matches)
            if (item.dayOfWeek !== null && item.dayOfWeek !== undefined && item.dayOfWeek === dayOfWeek) {
                // If recurringUntil is set, check if target date is within range
                if (item.recurringUntil) {
                    const untilDate = new Date(item.recurringUntil);
                    // Set untilDate to end of day to include the recurringUntil date itself
                    untilDate.setHours(23, 59, 59, 999); 
                    if (date > untilDate) return false; // If target date is after recurringUntil, don't show
                }
                return true;
            }
            if (item.date) {
                const itemDate = new Date(item.date).toLocaleDateString('en-CA');
                return itemDate === dateStr;
            }
            return false;
        });
    };


    useEffect(() => {
        const timer = setInterval(() => setCurrentDate(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Reset view date when opened
    useEffect(() => {
        if (isOpen) {
            setViewDate(new Date());
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = currentDate.getDate();
    const isCurrentMonth = currentDate.getMonth() === month && currentDate.getFullYear() === year;

    // Helper to parse time string to decimal hours (e.g. "9:00 AM" -> 9.0, "20:00" -> 20.0)
    const parseTimeToHours = (timeStr: string): number => {
        if (timeStr.toLowerCase() === "all day") return 0;
        const parts = timeStr.trim().split(' ');
        const [time, modifier] = parts;
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier) {
            if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        return hours + (minutes ? minutes / 60 : 0);
    };

    // Days in current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // First day of week (0 = Sunday)
    const firstDay = new Date(year, month, 1).getDay();

    const days = [];
    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
        days.push(null);
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i);
    }

    const weekDays = language === "th" 
        ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const monthNames = language === "th"
        ? ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
        : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const monthNamesShort = language === "th"
        ? ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Buddhist Era for Thai
    const displayYear = language === "th" ? year + 543 : year;

    const handlePrevMonth = () => {
        const d = new Date(viewDate);
        d.setMonth(d.getMonth() - 1);
        setViewDate(d);
    };

    const handleNextMonth = () => {
        const d = new Date(viewDate);
        d.setMonth(d.getMonth() + 1);
        setViewDate(d);
    };

    const handleDaySelect = (date: Date) => {
        setSelectedDate(date);
        // Sync view date if jumping months
        if (date.getMonth() !== viewDate.getMonth() || date.getFullYear() !== viewDate.getFullYear()) {
            setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
        }
        setSelectedAgendaId(null);
    };



    const handlePrevAgenda = () => {
        const baseDate = selectedDate || currentDate;
        const currentAgendas = getAgendasForDate(baseDate);
        if (currentAgendas.length === 0) return;

        if (selectedAgendaId) {
            const currentIndex = currentAgendas.findIndex(a => a.id === selectedAgendaId);
            if (currentIndex > 0) {
                setSelectedAgendaId(currentAgendas[currentIndex - 1].id);
            } else {
                // Wrap around to last item
                setSelectedAgendaId(currentAgendas[currentAgendas.length - 1].id);
            }
        } else {
            setSelectedAgendaId(currentAgendas[currentAgendas.length - 1].id);
        }
    };

    const handleNextAgenda = () => {
        const baseDate = selectedDate || currentDate;
        const currentAgendas = getAgendasForDate(baseDate);
        if (currentAgendas.length === 0) return;

        if (selectedAgendaId) {
            const currentIndex = currentAgendas.findIndex(a => a.id === selectedAgendaId);
            if (currentIndex >= 0 && currentIndex < currentAgendas.length - 1) {
                setSelectedAgendaId(currentAgendas[currentIndex + 1].id);
            } else {
                // Wrap around to first item
                setSelectedAgendaId(currentAgendas[0].id);
            }
        } else {
            setSelectedAgendaId(currentAgendas[0].id);
        }
    };

    // Handle date click
    const handleDateClick = (day: number) => {
        const date = new Date(year, month, day);
        handleDaySelect(date);
    };



    const [isFull, setIsFull] = useState(false);
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(true);


    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-90" onClick={onClose} />
            
            <div 
                className={`
                    ${isFull ? 'fixed inset-x-2 bottom-2 top-12 md:inset-x-6 md:bottom-6 md:top-14 xl:inset-x-10 xl:bottom-10 xl:top-16' : 'absolute top-full right-0 mt-3 w-[576px] max-w-[calc(100vw-1.5rem)] h-[290px]'}
                    rounded-2xl shadow-2xl overflow-hidden z-100 transition-all animate-in fade-in zoom-in-95 select-none flex flex-col
                `}
                style={{
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.outline}`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Main Content Row */}
                <div className={`flex min-h-0 ${isFull ? 'flex-1 overflow-hidden' : 'h-full overflow-hidden flex-row'}`}>

                {/* LEFT SIDEBAR: Brand & Date (Expanded Only) */}
                {isFull && (
                    <div 
                        className="hidden lg:flex w-[180px] shrink-0 flex-col p-6 relative overflow-hidden"
                        style={{ backgroundColor: colors.secondary }}
                    >
                        {/* Top-right Diagonal Accent (Flipped) */}
                        <div 
                            className="absolute top-0 right-0 w-[400px] h-[400px] translate-x-1/2 -translate-y-1/2 rotate-45 opacity-[0.08] bg-black pointer-events-none"
                        />

                        {/* Branded Header */}
                        <div className="mb-14 relative z-10">
                            <div className="text-[24px] font-black leading-tight tracking-[-0.04em] text-black/90 uppercase">
                                REALITY<br/>
                                <span className="text-[22px]">Launcher</span>
                            </div>
                            <div className="w-14 h-[4px] bg-black/20 mt-4" />
                        </div>

                        {/* Large Month Display */}
                        <div className="flex flex-col relative z-10">
                            <div className="text-7xl font-black tracking-tighter text-black/90 mb-4 drop-shadow-sm">
                                {(month + 1).toString().padStart(2, '0')}
                            </div>
                            <div className="h-px bg-black/10 w-full mb-6" />
                            <div className="text-[20px] font-black text-black/80 leading-none mb-2">
                                {monthNames[month]}
                            </div>
                            <div className="text-[12px] font-bold text-black/40 tracking-tight">
                                {year} / {year + 543}
                            </div>
                        </div>

                        {/* Small Footer Text */}
                        <div className="mt-auto relative z-10">
                            <div className="h-px bg-black/10 w-full mb-6" />
                            <div className="text-[10px] font-black text-black/50 uppercase tracking-[0.15em] mb-2 leading-none">
                                REALITY LAUNCHER
                            </div>
                            <a 
                                href="https://reality.catlabdesign.space/" 
                                onClick={(e) => {
                                    e.preventDefault();
                                    window.api?.openExternal("https://reality.catlabdesign.space/");
                                }}
                                className="text-[9px] font-bold text-black/30 leading-relaxed max-w-[140px] break-all hover:text-black/60 transition-colors cursor-pointer"
                            >
                                https://reality.catlabdesign.space/
                            </a>
                        </div>
                    </div>
                )}

                {/* MAIN AREA: Weekly Schedule Grid (Expanded) or Calendar Grid (Popup) */}
                <div className="flex-1 flex flex-col relative backdrop-blur-sm min-w-0 shrink overflow-hidden" style={{ backgroundColor: isFull ? (colors.surface === '#ffffff' ? '#ffffff' : colors.surface) : 'transparent' }}>
                    {/* Header */}
                    <div 
                        className={`${isFull ? 'px-8 py-5' : 'px-4 py-3'} flex items-center justify-between`}
                        style={{
                            borderBottom: `1px solid ${colors.outline}15`,
                            backgroundColor: isFull ? 'transparent' : colors.onSurface + '05'
                        }}
                    >
                         <div className="flex items-center gap-2">
                            <button 
                                onClick={handlePrevMonth}
                                className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                <Icons.ChevronLeft className="w-6 h-6" />
                            </button>
                            <div className="flex flex-col ml-1">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm md:text-lg font-black uppercase tracking-tight" style={{ color: colors.onSurface }}>
                                        {monthNames[month]}
                                    </span>
                                    {isFull && (
                                        <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/10 ml-1 uppercase">
                                            {language === 'th' ? 'กำหนดการรายเดือน' : 'MONTHLY SCHEDULE'}
                                        </span>
                                    )}
                                </div>
                                {!isFull && (
                                    <span className="text-xs font-bold opacity-60" style={{ color: colors.onSurfaceVariant }}>
                                        {displayYear}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    setViewDate(new Date());
                                    setSelectedDate(null);
                                }}
                                className="text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors opacity-60 hover:opacity-100 whitespace-nowrap"
                                style={{ color: colors.secondary }}
                            >
                                {language === 'th' 
                                    ? (isCurrentMonth ? 'วันนี้' : 'กลับวัน') 
                                    : (isCurrentMonth ? 'TODAY' : 'BACK')
                                }
                            </button>
                            <button 
                                onClick={handleNextMonth}
                                className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                <Icons.ChevronRight className="w-6 h-6" />
                            </button>

                            <div className="w-px h-4 bg-black/10 mx-1" />

                            <button 
                                onClick={() => {
                                    onRefresh?.();
                                    // Also trigger local fetch if instanceId exists
                                    if (instanceId) {
                                        setIsLoadingAgendas(true);
                                        (window as any).api?.fetchInstanceAgendas?.(instanceId)
                                            .then((res: any) => {
                                                if (res && res.ok) {
                                                    setAgendas(res.agendas || []);
                                                }
                                            })
                                            .finally(() => setIsLoadingAgendas(false));
                                    }
                                }}
                                className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${isLoadingAgendas ? 'opacity-40 pointer-events-none' : ''}`}
                                style={{ color: colors.secondary }}
                                title={language === 'th' ? 'รีเฟรช' : 'Refresh'}
                            >
                                <Icons.Refresh className={`w-4 h-4 ${isLoadingAgendas ? 'animate-spin' : ''}`} />
                            </button>

                            <button 
                                onClick={() => setIsFull(!isFull)}
                                className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                                style={{ color: colors.primary }}
                            >
                                {isFull ? <Icons.Minimize className="w-4 h-4" /> : <Icons.Maximize className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    {!isFull ? (
                        /* Popup mode: Monthly grid */
                        <div className="p-3 flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'transparent' }}>
                            <div className="grid grid-cols-7 mb-2">
                                {weekDays.map((day, i) => (
                                    <div key={i} className="text-center text-[10px] font-bold opacity-40 uppercase tracking-widest" style={{ color: colors.onSurface }}>
                                        {day}
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {days.map((day, i) => {
                                    if (day === null) return <div key={`empty-${i}`} className="aspect-square" />;
                                    const isToday = isCurrentMonth && day === today;
                                    const isSelected = selectedDate && 
                                                       selectedDate.getDate() === day && 
                                                       selectedDate.getMonth() === month && 
                                                       selectedDate.getFullYear() === year;
                                    return (
                                        <button
                                            key={day}
                                            onClick={() => handleDateClick(day as number)}
                                            className={`
                                                aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all relative
                                                ${isToday ? 'shadow-lg ring-1 ring-white/20' : 'hover:bg-black/5 opacity-80 hover:opacity-100'}
                                                ${isSelected ? 'ring-2 ring-offset-1 ring-offset-transparent' : ''}
                                            `}
                                            style={{
                                                backgroundColor: isToday ? colors.secondary : (isSelected ? colors.surfaceContainer : 'transparent'),
                                                color: isToday ? '#1a1a1a' : colors.onSurface,
                                                borderColor: isSelected ? colors.primary : 'transparent'
                                            }}
                                        >
                                            <span className="text-sm">{day}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* Expanded Mode: Full Month Grid */
                        <div className="flex-1 flex flex-col min-h-0 bg-white" style={{ backgroundColor: colors.surface }}>
                            <div className="grid grid-cols-7 border-b" style={{ borderColor: colors.outline + '10' }}>
                                {weekDays.map((day, i) => (
                                    <div key={i} className="py-3 text-center text-[11px] font-black opacity-30 uppercase tracking-[0.2em]" style={{ color: colors.onSurface }}>
                                        {day}
                                    </div>
                                ))}
                            </div>
                            
                            <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
                                {days.map((day, i) => {
                                    if (day === null) return (
                                        <div key={`empty-${i}`} className="border-r border-b p-2 opacity-20 bg-gray-50/10" style={{ borderColor: colors.outline + '08' }} />
                                    );
                                    
                                    const isToday = isCurrentMonth && day === today;
                                    const isSelected = selectedDate && 
                                                       selectedDate.getDate() === day && 
                                                       selectedDate.getMonth() === month && 
                                                       selectedDate.getFullYear() === year;
                                    
                                    const dateObj = new Date(year, month, day);
                                    const scheduledItems = getAgendasForDate(dateObj);
                                    
                                    return (
                                            <button
                                                key={day}
                                                onClick={() => handleDateClick(day as number)}
                                                className={`
                                                    flex flex-col border-r border-b p-2 transition-all relative group
                                                    ${isSelected ? 'bg-blue-500/10' : 'hover:bg-black/5'}
                                                `}
                                                style={{ 
                                                    borderColor: colors.outline + '08',
                                                }}
                                            >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span 
                                                    className={`
                                                        w-7 h-7 flex items-center justify-center rounded-full text-sm font-black transition-colors
                                                        ${isToday ? 'bg-blue-500 text-white shadow-lg' : isSelected ? 'bg-black text-white' : 'opacity-60'}
                                                    `}
                                                    style={{
                                                        backgroundColor: isToday ? colors.secondary : (isSelected ? colors.onSurface : 'transparent'),
                                                        color: isToday || isSelected ? (colors.surface === '#ffffff' ? '#ffffff' : '#000000') : colors.onSurface
                                                    }}
                                                >
                                                    {day}
                                                </span>
                                            </div>
                                            
                                            {/* Schedule Items Icons */}
                                            <div className="flex flex-wrap gap-1 px-1 mt-auto">
                                                {scheduledItems.slice(0, 3).map((item, idx) => {
                                                    // Resolve icon with capitalization (e.g. "calendar" -> "Calendar")
                                                    const iconKey = (item.icon ? (item.icon.charAt(0).toUpperCase() + item.icon.slice(1)) : "Calendar") as keyof typeof Icons;
                                                    const IconComp = Icons[iconKey] || Icons.Calendar;
                                                    return (
                                                        <div key={idx} className="p-1 rounded-md bg-black/5" style={{ color: item.color || '#3b82f6' }} title={item.title}>
                                                            <IconComp className="w-3 h-3" />
                                                        </div>
                                                    );
                                                })}
                                                
                                                {scheduledItems.length > 3 && (
                                                    <div className="text-[9px] font-bold opacity-30 self-center ml-1">
                                                        +{scheduledItems.length - 3}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Selection corner highlight */}
                                            {isSelected && (
                                                <div className="absolute top-0 right-0 w-8 h-8 overflow-hidden pointer-events-none">
                                                    <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-full" style={{ backgroundColor: colors.secondary }} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Details Panel */}
                <div
                    className={isFull ? "hidden md:flex w-[360px] xl:w-[440px] flex-col z-10 border-l bg-gray-50/10" : "flex-[0.75] min-w-[200px] flex flex-col shadow-inner z-10 border-l"}
                    style={{
                        backgroundColor: isFull ? (colors.surface === '#ffffff' ? '#f8f9fa' : colors.surfaceContainer + '30') : colors.surfaceContainer + '60',
                        borderColor: `${colors.outline}15`,
                    }}
                >
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                             {/* Sidebar Header: Banner & Clock */}
                             <div className="flex flex-col border-b overflow-hidden shrink-0" style={{ borderColor: colors.outline + '10' }}>
                                {(() => {
                                    const dayAgendas = getAgendasForDate(selectedDate || currentDate);
                                    let activeAgenda = selectedAgendaId ? dayAgendas.find(a => a.id === selectedAgendaId) : null;
                                    
                                    // If no agenda is selected, but agendas exist, preview the first one visually
                                    if (!activeAgenda && dayAgendas.length > 0) {
                                        activeAgenda = dayAgendas[0];
                                    }
                                    
                                    const bannerUrl = (activeAgenda?.instanceBannerUrl || dayAgendas.find(a => a.instanceBannerUrl)?.instanceBannerUrl || bannerImage.src);
                                    const iconUrl = activeAgenda?.instanceIconUrl || dayAgendas.find(a => a.instanceIconUrl)?.instanceIconUrl;
                                    const serverName = activeAgenda?.instanceName || dayAgendas.find(a => a.instanceName)?.instanceName || "REALITY LAUNCHER";
                                    
                                    return (
                                        <div className={`w-full ${isFull ? 'h-56' : 'h-28'} relative group overflow-hidden`}>
                                            {/* Translucent Backdrop (for smooth transition feel) */}
                                            <div className="absolute inset-0 bg-black/20 z-0" />
                                            
                                            <img 
                                                key={bannerUrl}
                                                src={bannerUrl} 
                                                alt="Instance Banner" 
                                                className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-105 animate-in fade-in zoom-in-105"
                                            />
                                            
                                            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent z-10" />
                                            
                                            {/* Hover Details Overlay */}
                                            <div className="absolute inset-0 z-15 opacity-0 group-hover:opacity-100 transition-opacity duration-700 backdrop-blur-md bg-black/40 flex flex-col justify-center p-8">
                                                {activeAgenda ? (
                                                    <div className="animate-in fade-in duration-1000">
                                                        <div className={`${isFull ? 'text-sm' : 'text-[10px]'} font-black text-blue-400 uppercase tracking-[0.2em] mb-2`}>
                                                            {activeAgenda.time} {activeAgenda.endTime && `- ${activeAgenda.endTime}`}
                                                        </div>
                                                        <h4 className={`${isFull ? 'text-xl' : 'text-sm'} font-black text-white uppercase leading-tight mb-2 line-clamp-2`}>{activeAgenda.title}</h4>
                                                        {activeAgenda.description && (
                                                            <p className={`${isFull ? 'text-sm' : 'text-[10px]'} font-bold text-white/60 leading-relaxed line-clamp-3`}>
                                                                {activeAgenda.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-center animate-in fade-in duration-1000">
                                                        <Icons.Info className="w-8 h-8 text-white/20 mx-auto mb-3" />
                                                        <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                                                            {language === 'th' ? 'ไม่มีกิจกรรมให้แสดง' : 'NO EVENTS TO PREVIEW'}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="absolute bottom-4 left-5 flex items-center gap-4 z-20 group-hover:opacity-0 transition-opacity duration-300">
                                                <div className="relative shrink-0">
                                                    {iconUrl ? (
                                                        <img key={iconUrl} src={iconUrl} alt="" className="w-12 h-12 rounded-2xl object-cover aspect-square animate-in zoom-in-50 duration-500 shrink-0" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center aspect-square shrink-0">
                                                            <Icons.Calendar className="w-6 h-6 text-white/50" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-base font-black text-white uppercase tracking-[0.15em] drop-shadow-lg leading-none mb-1">
                                                        {serverName}
                                                    </span>
                                                    <span className={`${isFull ? 'text-xs' : 'text-[10px]'} font-bold text-white/50 uppercase tracking-widest line-clamp-1`}>
                                                        {activeAgenda ? (activeAgenda.location || activeAgenda.instanceName || (language === 'th' ? 'เลือกกิจกรรมแล้ว' : 'EVENT SELECTED')) : (dayAgendas.length > 0 ? `${dayAgendas.length} ${language === 'th' ? 'กิจกรรมที่มี' : 'EVENTS AVAILABLE'}` : (language === 'th' ? 'ว่าง' : 'IDLE SESSION'))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className={`${isFull ? 'hidden xl:block' : ''} px-6 ${isFull ? 'py-4' : 'py-3'} text-center bg-linear-to-b from-transparent to-black/5 border-b border-black/5`}>
                                    <div className={`${isFull ? 'text-5xl' : 'text-3xl'} font-black tracking-tighter`} style={{ color: colors.secondary }}>
                                        {currentDate.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                    </div>
                                    <div className={`${isFull ? 'text-sm' : 'text-[10px]'} font-bold uppercase tracking-[0.2em] opacity-30 mt-1`} style={{ color: colors.onSurface }}>
                                        {randomStatus}
                                    </div>
                                </div>
                            </div>

                        <div className={`${isFull ? 'pl-0 pr-10 py-8' : 'p-4 pt-3'} flex flex-col flex-1 overflow-hidden min-h-0`}>
                            {(() => {
                                const activeDate = selectedDate || currentDate;
                                const dayAgendas = getAgendasForDate(activeDate);
                                
                                return (
                                    <>
                                        {/* Header Row: Date & Navigation */}
                                        <div className={`${isFull ? 'mb-2' : 'mb-2'} flex items-start justify-between shrink-0`}>
                                            <div className="flex items-start gap-4">
                                                <div className="w-1.5 h-8 rounded-full mt-1.5" style={{ backgroundColor: colors.secondary }} />
                                                <div className="flex flex-col">
                                                    <h3 className={`${isFull ? 'text-4xl' : 'text-3xl'} font-black tracking-tight`} style={{ color: colors.onSurface }}>
                                                        {activeDate.getDate()} {monthNamesShort[activeDate.getMonth()]}
                                                    </h3>
                                                    <p className={`${isFull ? 'text-xs' : 'text-[11px]'} font-black opacity-30 mt-0.5 uppercase tracking-wider`} style={{ color: colors.onSurface }}>
                                                        {language === 'th' ? `พ.ศ. ${activeDate.getFullYear() + 543}` : activeDate.getFullYear()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 mt-2">
                                                <button onClick={handlePrevAgenda} className="p-1.5 rounded-xl hover:bg-black/5 opacity-40 hover:opacity-100" style={{ color: colors.onSurfaceVariant }}>
                                                    <Icons.ChevronLeft className="w-5 h-5" />
                                                </button>
                                                <button onClick={handleNextAgenda} className="p-1.5 rounded-xl hover:bg-black/5 opacity-40 hover:opacity-100" style={{ color: colors.onSurfaceVariant }}>
                                                    <Icons.ChevronRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Content Scroll Area */}
                                        <div className="flex-1 overflow-y-auto px-1 pr-2 custom-scrollbar min-h-0">
                                            {/* Agendas Section */}
                                            {isFull && (
                                                <div className="mb-4">
                                                    <div className={`flex items-center justify-between mb-3 border-b pt-3 pb-3 sticky top-0 backdrop-blur-md z-20 ${isFull ? 'px-4' : ''}`} style={{ backgroundColor: colors.surface === '#ffffff' ? 'rgba(255, 255, 255, 0.95)' : colors.surface + 'f2', borderColor: colors.onSurface + '10' }}>
                                                        <span className={`${isFull ? 'text-sm' : 'text-[10px]'} font-black uppercase tracking-[0.2em] opacity-40`} style={{ color: colors.onSurface }}>{language === 'th' ? 'กำหนดการ' : 'Agenda'}</span>
                                                        {isFull && instanceId && (
                                                            <button 
                                                                onClick={() => (window as any).api?.openExternal?.(`https://reality.catlabdesign.space/instances/${instanceId}/schedule`)}
                                                                className="text-xs font-black text-blue-500 hover:opacity-70 uppercase"
                                                            >
                                                                {language === 'th' ? 'แก้ไข' : 'MODIFY'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1">
                                                        {dayAgendas.length === 0 ? (
                                                            <div className="py-12 text-center opacity-30 flex flex-col items-center">
                                                                <Icons.Calendar className="w-10 h-10 mb-3 opacity-20" />
                                                                <div className="text-[10px] font-black uppercase tracking-[0.3em]">{language === 'th' ? 'ไม่มีกิจกรรม' : 'NO EVENTS'}</div>
                                                            </div>
                                                        ) : (
                                                            dayAgendas.map((item: any) => (
                                                                <AgendaItem 
                                                                    key={item.id}
                                                                    item={item}
                                                                    isFull={isFull}
                                                                    isSelected={selectedAgendaId === item.id}
                                                                    onClick={() => setSelectedAgendaId(selectedAgendaId === item.id ? null : item.id)}
                                                                    colors={colors}
                                                                    language={language}
                                                                />
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Footer Section */}
                        {isFull && (
                            <div className="mt-auto pt-2 pb-3 border-t text-center shrink-0" style={{ borderColor: colors.outline + '10' }}>
                                <span className="text-[10px] font-bold tracking-wider opacity-40 uppercase" style={{ color: colors.onSurface }}>
                                    {language === 'th' ? 'กำหนดการของเซิร์ฟเวอร์' : 'Server Schedule'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </>
    );
}
