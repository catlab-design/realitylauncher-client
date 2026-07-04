import { useEffect, type ComponentProps, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useTranslation } from "../hooks/useTranslation";
import { playClick } from "../lib/sounds";
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeInOut" } }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("settings")}
            className="flex h-[min(80vh,760px)] w-full max-w-[1520px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface, fontSize: 15 }}
            onClick={stopPropagation}
            initial={{ opacity: 0, y: 28, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
          >
            <motion.div
              className="flex items-center justify-between border-b px-6 py-3.5 sm:px-7"
              style={{
                borderColor: `${colors.onSurface}10`,
                backgroundColor: colors.surfaceContainerLow || colors.surfaceContainer,
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, delay: 0.04, ease: "easeOut" }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: colors.secondary,
                    color: "#1a1a1a",
                  }}
                >
                  <Icons.Settings className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h2
                    className="text-lg font-black tracking-tight"
                    style={{ color: colors.onSurface }}
                  >
                    {t("settings")}
                  </h2>
                  <p
                    className="text-xs opacity-75"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    {t("launcher_settings")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            </motion.div>

            <motion.div
              className="min-h-0 flex-1 overflow-hidden px-6 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.24, delay: 0.08, ease: "easeOut" }}
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
