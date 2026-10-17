import { useEffect, type ComponentProps, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useTranslation } from "../hooks/useTranslation";
import { playClick } from "../lib/sounds";
import { useMotionPreset } from "../lib/motion";
import { Settings } from "./tabs/Settings";
import { Icons } from "./ui/Icons";

interface SettingsDialogProps extends ComponentProps<typeof Settings> {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  config,
  colors,
  ...settingsProps
}: SettingsDialogProps) {
  const { t } = useTranslation(config.language);
  const m = useMotionPreset();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleClose = () => {
    if (config.clickSoundEnabled) {
      playClick();
    }
    onClose();
  };

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5"
          onClick={handleClose}
          variants={m.modal.backdrop}
          {...m.states}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("settings")}
            className="flex h-[min(86vh,860px)] w-full max-w-300 flex-col overflow-hidden rounded-2xl"
            style={{ backgroundColor: colors.surface, fontSize: 15 }}
            onClick={stopPropagation}
            variants={m.modal.panel}
          >
            <motion.div
              className="flex items-center justify-between px-6 pt-5 pb-2 sm:px-8"
              variants={m.fadeIn}
            >
              <h2 className="font-display text-2xl" style={{ color: colors.onSurface }}>
                {t("settings")}
              </h2>

              <button
                type="button"
                onClick={handleClose}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:brightness-110"
                style={{
                  color: colors.onSurface,
                  backgroundColor: colors.surfaceContainerHigh,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            </motion.div>

            <motion.div
              className="min-h-0 flex-1 overflow-hidden px-6 pb-6 pt-4 sm:px-8 sm:pb-8"
              variants={m.fadeUp}
            >
              <Settings
                config={config}
                colors={colors}
                {...settingsProps}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
