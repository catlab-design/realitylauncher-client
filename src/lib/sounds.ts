/**
 * Sound Effects Utility
 * เล่นเสียง UI สำหรับ Launcher
 */
import toast from 'react-hot-toast';

// Import sound assets
import clickSound from '../assets/click.mp3';
import notificationSound from '../assets/notification.mp3';
import succeedSound from '../assets/succeed.mp3';

// Pre-load audio files for instant playback
const audioCache: Record<string, HTMLAudioElement> = {};

export type SoundType = 'click' | 'notification' | 'succeed';

// Sound file URLs (from imports)
const SOUND_URLS: Record<SoundType, string> = {
    click: clickSound,
    notification: notificationSound,
    succeed: succeedSound,
};

// Pre-load all sounds
export function preloadSounds(): void {
    Object.keys(SOUND_URLS).forEach((key) => {
        const type = key as SoundType;
        const path = SOUND_URLS[type];
        const audio = new Audio(path);
        audio.preload = 'auto';
        audioCache[type] = audio;
    });
}

// Play a sound effect
export function playSound(type: SoundType, volume: number = 0.5): void {
    try {
        // Use cached audio or create new
        let audio = audioCache[type];

        if (!audio) {
            const path = SOUND_URLS[type];
            audio = new Audio(path);
            audioCache[type] = audio;
        }

        // Clone for overlapping sounds
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = Math.max(0, Math.min(1, volume));
        clone.play().catch(() => {
            // Ignore autoplay errors (user hasn't interacted yet)
        });
    } catch (e) {
        console.warn('[Sound] Failed to play:', type, e);
    }
}

// Sound Configuration State
let soundConfig = {
    clickSoundEnabled: true,
    notificationSoundEnabled: true,
};

// Update sound configuration
export const setSoundConfig = (config: { clickSoundEnabled: boolean; notificationSoundEnabled: boolean }) => {
    soundConfig = config;
};

// Convenience functions
export const playClick = (force?: boolean) => {
    if (force || soundConfig.clickSoundEnabled) playSound('click', 0.3);
};
export const playNotification = (force?: boolean) => {
    if (force || soundConfig.notificationSoundEnabled) playSound('notification', 0.5);
};
export const playSucceed = (force?: boolean) => {
    if (force || soundConfig.notificationSoundEnabled) playSound('succeed', 0.4);
};

// ========================================
// Toast Wrappers with Sound
// ========================================

/**
 * Show success toast with succeed sound
 */
export function toastSuccess(message: string, options?: Parameters<typeof toast.success>[1]) {
    playSucceed();
    return toast.success(message, options);
}

/**
 * Show error toast with notification sound
 */
export function toastError(message: string, options?: Parameters<typeof toast.error>[1]) {
    playNotification();
    return toast.error(message, options);
}

// ========================================
// Global Toast Sound (Auto-inject sounds to all toasts)
// ========================================

// Store original functions
const originalSuccess = toast.success.bind(toast);
const originalError = toast.error.bind(toast);

// Override toast.success globally
toast.success = ((message: any, options?: any) => {
    playSucceed();
    return originalSuccess(message, options);
}) as typeof toast.success;

// Override toast.error globally
toast.error = ((message: any, options?: any) => {
    playNotification();
    return originalError(message, options);
}) as typeof toast.error;

// Initialize on load
if (typeof window !== 'undefined') {
    preloadSounds();
}
