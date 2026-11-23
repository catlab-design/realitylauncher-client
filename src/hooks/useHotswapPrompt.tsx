import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "./useTranslation";
import type { TranslationKey } from "../i18n/translations";
import { useConfigStore } from "../store/configStore";

const OFFER_TOAST_ID = "hotswap-offer";
const RESULT_TOAST_ID = "hotswap-result";
const STATE_POLL_MS = 2000;

const RESULT_COPY: Partial<Record<HotswapResultEvent["outcome"], { key: TranslationKey; ok: boolean }>> = {
  applied: { key: "hotswap_applied", ok: true },
  restart: { key: "hotswap_restart", ok: true },
  failed: { key: "hotswap_failed", ok: false },
};

function OfferToast({ offer, accent, toastId }: { offer: HotswapOffer; accent: string; toastId: string }) {
  const { t } = useTranslation();
  const [atMenu, setAtMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const canApply = offer.liveCount > 0;

  useEffect(() => {
    if (!canApply) return;
    let alive = true;
    const poll = async () => {
      const state = await window.api?.hotswapGameState?.().catch(() => null);
      if (alive) setAtMenu(state === "menu");
    };
    void poll();
    const id = setInterval(poll, STATE_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [canApply]);

  const apply = async () => {
    setBusy(true);
    try {
      await window.api?.hotswapApply?.(offer.instanceId, offer.version);
    } catch (e) {
      console.log("[Hotswap] apply refused:", e);
    }
    toast.dismiss(toastId);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">{t(canApply ? "hotswap_prompt" : "hotswap_restart")}</span>
      {canApply && !atMenu && <span className="text-xs opacity-70">{t("hotswap_go_to_menu")}</span>}
      <div className="flex items-center gap-2">
        {canApply && (
          <button
            type="button"
            disabled={!atMenu || busy}
            className="h-8 px-3 rounded-full text-xs font-bold text-[#111] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}
            onClick={apply}
          >
            {t("hotswap_apply")}
          </button>
        )}
        <button
          type="button"
          className="h-8 px-3 rounded-full text-xs font-semibold opacity-70 hover:opacity-100 shrink-0"
          onClick={() => toast.dismiss(toastId)}
        >
          {t(canApply ? "hotswap_later" : "hotswap_dismiss")}
        </button>
      </div>
    </div>
  );
}

/** Shows the pack-update prompt and the swap result toasts. Mount once. */
export function useHotswapPrompt(accent: string) {
  const { t } = useTranslation();
  const disabled = useConfigStore((s) => !!s.disableHotswap);

  useEffect(() => {
    if (disabled) return;
    const api = window.api;
    const offLive = api?.onHotswapOffer?.((offer) => {
      if (offer.revoked) {
        toast.dismiss(OFFER_TOAST_ID);
        return;
      }
      if (offer.liveCount === 0 && offer.restartCount === 0) return;
      toast.custom(
        (tt) => (
          <div
            className="rounded-xl px-4 py-3 shadow-lg bg-[#1f1f23] text-white"
            style={{ opacity: tt.visible ? 1 : 0 }}
          >
            <OfferToast offer={offer} accent={accent} toastId={tt.id} />
          </div>
        ),
        { id: OFFER_TOAST_ID, duration: Infinity },
      );
    });
    const offResult = api?.onHotswapResult?.((result) => {
      const copy = RESULT_COPY[result.outcome];
      if (!copy) {
        console.log("[Hotswap] result:", result.outcome, result.error ?? "");
        return;
      }
      toast.dismiss(OFFER_TOAST_ID);
      const show = copy.ok ? toast.success : toast.error;
      show(t(copy.key), { id: RESULT_TOAST_ID, duration: 5000 });
    });
    return () => {
      offLive?.();
      offResult?.();
    };
  }, [disabled, accent, t]);
}
