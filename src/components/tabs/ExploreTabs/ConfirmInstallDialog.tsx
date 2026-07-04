import React from "react";
import { createPortal } from "react-dom";
import type { ModrinthProject } from "./types";
import { useTranslation } from "../../../hooks/useTranslation";

interface ConfirmInstallDialogProps {
    colors: any;
    project: ModrinthProject;
    duplicate: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function ConfirmInstallDialog({ colors, project, duplicate, onCancel, onConfirm }: ConfirmInstallDialogProps) {
    const { t } = useTranslation();
    return createPortal(
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
            <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: colors.surface }} onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-2" style={{ color: colors.onSurface }}>
                    {t("confirm_install_modpack_title")}
                </h3>
                <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>
                    {(duplicate ? t("already_installed_modpack") : t("confirm_install_modpack_body")).replace("{name}", project.title)}
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-semibold"
                        style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    >
                        {t("cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-sm font-bold"
                        style={{ backgroundColor: colors.secondary, color: "#000" }}
                    >
                        {t("install")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
