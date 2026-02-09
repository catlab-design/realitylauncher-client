import React, { useState, useEffect } from "react";
import { Icons } from "./Icons";

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
}

let lastMessageIndex = -1;

export function CalendarWidget({ isOpen, onClose, colors, language }: CalendarWidgetProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    interface Note {
        text: string;
        icon: string;
    }

    const [notes, setNotes] = useState<Record<string, Note>>({});
    const [noteInput, setNoteInput] = useState("");
    const [noteIcon, setNoteIcon] = useState("star");

    const NOTE_ICONS = [
        { id: 'star', icon: Icons.Star, color: 'text-yellow-400' },
        { id: 'heart', icon: Icons.Heart, color: 'text-pink-400' },
        { id: 'info', icon: Icons.Info, color: 'text-blue-400' },
        { id: 'clock', icon: Icons.Clock, color: 'text-orange-400' },
        { id: 'controller', icon: Icons.Controller, color: 'text-purple-400' },
        { id: 'check', icon: Icons.Check, color: 'text-green-400' },
        { id: 'x', icon: Icons.X, color: 'text-red-400' },
    ];

    // Load notes from localStorage on mount
    useEffect(() => {
        const savedNotes = localStorage.getItem('calendar_notes');
        if (savedNotes) {
            try {
                const parsed = JSON.parse(savedNotes);
                // Migration: Check if values are strings (old format) or objects
                const migrated: Record<string, Note> = {};
                let hasMigration = false;
                
                Object.entries(parsed).forEach(([key, value]) => {
                    if (typeof value === 'string') {
                        migrated[key] = { text: value, icon: 'star' };
                        hasMigration = true;
                    } else {
                        migrated[key] = value as Note;
                    }
                });

                setNotes(migrated);
                if (hasMigration) {
                    localStorage.setItem('calendar_notes', JSON.stringify(migrated));
                }
            } catch (e) {
                console.error("Failed to parse calendar notes", e);
            }
        }
    }, []);

    // Save notes to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('calendar_notes', JSON.stringify(notes));
    }, [notes]);

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

    // Buddhist Era for Thai
    const displayYear = language === "th" ? year + 543 : year;

    const handlePrevMonth = () => {
        setViewDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(year, month + 1, 1));
    };

    // Random messages
    const messages = {
        th: [
            "ออกไปแตะหญ้าบ้างนะ",
            "ขอบคุณที่แตะฉัน",
            "วันนี้ก็ยังหายใจอยู่สินะ",
            "อย่าลืมกินข้าวนะ",
            "ทำงานหนักไปหรือเปล่า",
            "พักสายตาบ้างเถอะ",
            "โลกแตกหรือยัง?",
            "นอนบ้างนะ",
            "เดี๋ยวมันก็ผ่านไป",
            "สู้เขานะ",
            "รักตัวเองให้มากๆ",
            "วันนี้คุณเก่งมากแล้ว"
        ] as const,
        en: [
            "Go touch some grass.",
            "Thanks for clicking me!",
            "Still breathing?",
            "Don't forget to eat.",
            "Working too hard?",
            "Rest your eyes.",
            "Is the world ending?",
            "Go get some sleep.",
            "This too shall pass.",
            "Keep fighting.",
            "Love yourself properly.",
            "You did great today."
        ] as const
    };

    const [randomMessage, setRandomMessage] = useState("");

    // Store last index in a ref to persist across re-renders but reset on remount
    // Since we want it per session, we can use a module-level variable outside component
    // or just rely on randomness being good enough.
    // But to strict 'no repeat', let's use a static let outside if possible, or just a simple check.
    
    // Better: use a simple ref for 'last shown' if the component stays mounted.
    // If component unmounts (which it does), we need external storage.
    // For now, let's use a module-level variable approach by defining it outside.
    
    useEffect(() => {
        if (isOpen) {
            const msgs = language === 'th' ? messages.th : messages.en;
            let newIndex;
            // Simple logic to ensure we don't pick the same index twice in a row
            // Try up to 5 times to get a new index
            let attempts = 0;
            do {
                newIndex = Math.floor(Math.random() * msgs.length);
                attempts++;
            } while (newIndex === lastMessageIndex && attempts < 5 && msgs.length > 1);
            
            lastMessageIndex = newIndex;
            setRandomMessage(msgs[newIndex]);
        }
    }, [isOpen, language]);

    // Handle date click
    const handleDateClick = (day: number) => {
        const date = new Date(year, month, day);
        setSelectedDate(date);
        
        const dateKey = `${year}-${month}-${day}`;
        const note = notes[dateKey];
        setNoteInput(note?.text || "");
        setNoteIcon(note?.icon || "star");
    };

    const handleDeleteNote = () => {
        if (!selectedDate) return;
        const dateKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
        const newNotes = { ...notes };
        delete newNotes[dateKey];
        setNotes(newNotes);
        setNoteInput("");
        setNoteIcon("star");
    };

    const [isEditing, setIsEditing] = useState(false);

    // Reset editing state when date changes
    useEffect(() => {
        setIsEditing(false);
    }, [selectedDate]);

    // ... existing load/save effects ...

    // Handle note operations
    const handleStartEdit = () => {
        setIsEditing(true);
        // Ensure input is synced
        if (selectedDate) {
            const dateKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
            const note = notes[dateKey];
            setNoteInput(note?.text || "");
            setNoteIcon(note?.icon || "star");
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
    };

    const handleSaveNote = () => {
        if (!selectedDate) return;
        const dateKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
        
        if (noteInput.trim()) {
            setNotes(prev => ({ 
                ...prev, 
                [dateKey]: { text: noteInput, icon: noteIcon } 
            }));
        } else {
            const newNotes = { ...notes };
            delete newNotes[dateKey];
            setNotes(newNotes);
        }
        setIsEditing(false);
    };

    // ... existing delete ...

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[99]" onClick={onClose} />
            
            <div 
                className="absolute top-full right-0 mt-3 rounded-2xl shadow-2xl overflow-hidden z-[100] transition-all animate-in fade-in zoom-in-95 w-[600px] select-none flex"
                style={{
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.outline}`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* LEFT COLUMN: Calendar */}
                <div className="w-[320px] flex flex-col border-r" style={{ borderColor: colors.outline + '20' }}>
                    {/* Header */}
                    <div 
                        className="px-4 py-4 flex items-center justify-between"
                        style={{
                            background: `linear-gradient(to bottom, ${colors.surface}80, ${colors.surfaceContainer}40)`,
                            borderBottom: `1px solid ${colors.outline}20`
                        }}
                    >
                         {/* ... existing header content ... */}
                         <div className="flex items-center gap-1">
                            <button 
                                onClick={handlePrevMonth}
                                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                <Icons.ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex flex-col ml-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black uppercase tracking-tight" style={{ color: colors.onSurface }}>
                                        {monthNames[month]}
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/20">
                                        BETA
                                    </span>
                                </div>
                                <span className="text-xs font-bold opacity-60" style={{ color: colors.onSurfaceVariant }}>
                                    {displayYear}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    setViewDate(new Date());
                                    setSelectedDate(null);
                                }}
                                className="text-xs font-bold px-2 py-1 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                                style={{ color: colors.secondary }}
                                title={language === 'th' ? "วันนี้" : "Today"}
                            >
                                {isCurrentMonth ? (language === 'th' ? 'วันนี้' : 'TODAY') : (language === 'th' ? 'กลับไปวันนี้' : 'Go to Today')}
                            </button>
                            <button 
                                onClick={handleNextMonth}
                                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                <Icons.ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="p-4 flex-1" style={{ backgroundColor: colors.surfaceContainer + '40' }}>
                         {/* ... existing grid ... */}
                        <div className="grid grid-cols-7 mb-2">
                            {weekDays.map((day, i) => (
                                <div key={i} className="text-center text-xs font-bold opacity-40 py-1" style={{ color: colors.onSurface }}>
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {days.map((day, i) => {
                                if (day === null) return <div key={`empty-${i}`} />;
                                
                                const isToday = isCurrentMonth && day === today;
                                const isSelected = selectedDate && 
                                                   selectedDate.getDate() === day && 
                                                   selectedDate.getMonth() === month && 
                                                   selectedDate.getFullYear() === year;
                                
                                const dateKey = `${year}-${month}-${day}`;
                                const hasNote = !!notes[dateKey];

                                return (
                                    <button
                                        key={day}
                                        onClick={() => handleDateClick(day as number)}
                                        className={`
                                            aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all relative
                                            ${isToday ? 'scale-110 shadow-lg font-black' : ''}
                                            ${isSelected ? 'ring-2 ring-offset-1 ring-offset-transparent' : 'hover:bg-white/5 opacity-80 hover:opacity-100'}
                                        `}
                                        style={{
                                            backgroundColor: isToday ? colors.secondary : (isSelected ? colors.surfaceContainer : 'transparent'),
                                            color: isToday ? '#1a1a1a' : colors.onSurface,
                                            borderColor: isSelected ? colors.primary : 'transparent'
                                        }}
                                    >
                                        {day}
                                        {hasNote && notes[dateKey]?.icon && (() => {
                                            const note = notes[dateKey];
                                            const iconDef = NOTE_ICONS.find(i => i.id === note.icon) || NOTE_ICONS[0];
                                            const IconStart = iconDef.icon;
                                            return (
                                                <div className={`absolute bottom-0 right-0 p-0.5 ${isToday ? 'text-black' : iconDef.color}`}>
                                                    <IconStart className="w-2.5 h-2.5" />
                                                </div>
                                            );
                                        })()}
                                        {hasNote && !notes[dateKey]?.icon && (
                                            <div 
                                                className="absolute bottom-1 w-1 h-1 rounded-full" 
                                                style={{ backgroundColor: isToday ? '#1a1a1a' : colors.primary }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Details Panel */}
                <div className="flex-1 flex flex-col min-w-[280px] bg-black/20">
                    <div className="p-6 flex flex-col h-full">
                        {selectedDate ? (
                            <>
                                {/* Selected Date Header */}
                                <div className="mb-4">
                                    <h3 className="text-xl font-bold" style={{ color: colors.onSurface }}>
                                        {selectedDate.getDate()} {monthNames[selectedDate.getMonth()]}
                                    </h3>
                                    <p className="text-sm opacity-60 font-mono" style={{ color: colors.onSurfaceVariant }}>
                                        {selectedDate.getFullYear() + (language === 'th' ? 543 : 0)}
                                    </p>
                                </div>

                                {/* Content Area */}
                                <div className="flex-1 overflow-y-auto">
                                    {isEditing ? (
                                        <div className="fade-in animate-in slide-in-from-bottom-2">
                                            {/* Icon Selector */}
                                            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                                                {NOTE_ICONS.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => setNoteIcon(item.id)}
                                                        className={`
                                                            p-2 rounded-lg transition-all
                                                            ${noteIcon === item.id ? 'bg-white/10 ring-1 ring-white/50 scale-110' : 'hover:bg-white/5 opacity-60 hover:opacity-100'}
                                                        `}
                                                        title={item.id}
                                                    >
                                                        <item.icon className={`w-5 h-5 ${item.color}`} />
                                                    </button>
                                                ))}
                                            </div>

                                            <textarea
                                                value={noteInput}
                                                onChange={(e) => setNoteInput(e.target.value)}
                                                placeholder={language === 'th' ? "บันทึกรายละเอียด..." : "Add details..."}
                                                className="w-full h-[120px] bg-white/5 rounded-lg p-3 text-sm outline-none resize-none focus:bg-white/10 transition-colors"
                                                style={{ color: colors.onSurface, border: `1px solid ${colors.outline}40` }}
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-2 mt-2">
                                                 <button 
                                                    onClick={handleCancelEdit}
                                                    className="text-xs px-3 py-1.5 rounded hover:bg-white/10 transition-colors"
                                                    style={{ color: colors.onSurface }}
                                                >
                                                    {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                                </button>
                                                <button 
                                                    onClick={handleSaveNote}
                                                    className="text-xs px-3 py-1.5 rounded font-bold hover:brightness-110 transition-all"
                                                    style={{ backgroundColor: colors.primary, color: colors.surface }}
                                                >
                                                    {language === 'th' ? 'บันทึก' : 'Save'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="fade-in animate-in slide-in-from-left-2 h-full flex flex-col">
                                             {notes[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] ? (
                                                <div className="flex gap-3">
                                                    {(() => {
                                                         const note = notes[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`];
                                                         const iconDef = NOTE_ICONS.find(i => i.id === note.icon) || NOTE_ICONS[0];
                                                         const IconDisplay = iconDef.icon;
                                                         return (
                                                            <div className={`mt-0.5 shrink-0 ${iconDef.color}`}>
                                                                <IconDisplay className="w-5 h-5" />
                                                            </div>
                                                         );
                                                    })()}
                                                    <div className="text-sm leading-relaxed whitespace-pre-wrap flex-1" style={{ color: colors.onSurface }}>
                                                        {notes[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`].text}
                                                    </div>
                                                </div>
                                             ) : (
                                                 <div className="flex-1 flex items-center justify-center opacity-30 text-sm italic" style={{ color: colors.onSurface }}>
                                                     {language === 'th' ? 'ไม่มีบันทึก' : 'No notes'}
                                                 </div>
                                             )}
                                             
                                             <div className="mt-4 pt-4 border-t border-white/5 flex justify-end gap-2">
                                                 {notes[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] && (
                                                     <button 
                                                        onClick={handleDeleteNote}
                                                        className="text-xs px-3 py-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                                                    >
                                                        {language === 'th' ? 'ลบ' : 'Delete'}
                                                    </button>
                                                 )}
                                                 <button 
                                                    onClick={handleStartEdit}
                                                    className="text-xs px-4 py-1.5 rounded font-bold bg-white/5 hover:bg-white/10 transition-colors"
                                                    style={{ color: colors.secondary }}
                                                 >
                                                    {language === 'th' ? 'แก้ไข' : 'Edit'}
                                                 </button>
                                             </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            // Empty State / Default View
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                                <div className="mb-4">
                                     <span className="text-4xl font-mono font-bold tracking-widest block" style={{ color: colors.onSurfaceVariant }}>
                                        {currentDate.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', { hour12: false })}
                                     </span>
                                     <span className="text-xs uppercase tracking-widest opacity-60" style={{ color: colors.onSurface }}>
                                        {language === 'th' ? 'เวลาปัจจุบัน' : 'CURRENT TIME'}
                                     </span>
                                </div>
                                
                                {randomMessage && (
                                    <div className="max-w-[200px]">
                                        <span className="text-sm font-medium italic" style={{ color: colors.secondary }}>
                                            "{randomMessage}"
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer (Always visible bottom of right panel) */}
                         <div className="mt-auto pt-4 border-t border-white/5 text-center">
                             <span className="text-[10px] opacity-30 block leading-tight" style={{ color: colors.onSurface }}>
                                {language === 'th' 
                                    ? '* BETA: ฟีเจอร์ดูวันเล่นของเซิร์ฟเวอร์จะมาเร็วๆนี้'
                                    : '* BETA: Server play dates feature coming soon.'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
