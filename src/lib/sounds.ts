
import toast from 'react-hot-toast';


import clickSound from '../assets/click.mp3';
import notificationSound from '../assets/notification.mp3';
import succeedSound from '../assets/succeed.mp3';


const audioCache: Record<string, HTMLAudioElement> = {};

export type SoundType = 'click' | 'notification' | 'succeed';


const SOUND_URLS: Record<SoundType, string> = {
    click: clickSound,
    notification: notificationSound,
    succeed: succeedSound,
};


export function preloadSounds(): void {
    Object.keys(SOUND_URLS).forEach((key) => {
        const type = key as SoundType;
        const path = SOUND_URLS[type];
        const audio = new Audio(path);
        audio.preload = 'auto';
        audioCache[type] = audio;
    });
}


export function playSound(type: SoundType, volume: number = 0.5): void {
    try {
        
        let audio = audioCache[type];

        if (!audio) {
            const path = SOUND_URLS[type];
            audio = new Audio(path);
            audioCache[type] = audio;
        }

        
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = Math.max(0, Math.min(1, volume));
        clone.play().catch(() => {
            
        });
    } catch (e) {
        console.warn('[Sound] Failed to play:', type, e);
    }
}


let soundConfig = {
    clickSoundEnabled: true,
    notificationSoundEnabled: true,
};


export const setSoundConfig = (config: { clickSoundEnabled: boolean; notificationSoundEnabled: boolean }) => {
    soundConfig = config;
};


export const playClick = (force?: boolean) => {
    if (force || soundConfig.clickSoundEnabled) playSound('click', 0.3);
};
export const playNotification = (force?: boolean) => {
    if (force || soundConfig.notificationSoundEnabled) playSound('notification', 0.5);
};
export const playSucceed = (force?: boolean) => {
    if (force || soundConfig.notificationSoundEnabled) playSound('succeed', 0.4);
};






export function toastSuccess(message: string, options?: Parameters<typeof toast.success>[1]) {
    playSucceed();
    return toast.success(message, options);
}


export function toastError(message: string, options?: Parameters<typeof toast.error>[1]) {
    playNotification();
    return toast.error(message, options);
}






const originalSuccess = toast.success.bind(toast);
const originalError = toast.error.bind(toast);


toast.success = ((message: any, options?: any) => {
    playSucceed();
    return originalSuccess(message, options);
}) as typeof toast.success;


toast.error = ((message: any, options?: any) => {
    playNotification();
    return originalError(message, options);
}) as typeof toast.error;


if (typeof window !== 'undefined') {
    preloadSounds();
}
