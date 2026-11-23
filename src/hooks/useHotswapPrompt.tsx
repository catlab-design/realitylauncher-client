import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "./useTranslation";
import type { TranslationKey } from "../i18n/translations";
import { useConfigStore } from "../store/configStore";
import { canApplyOffer, showMenuHint, type AgentState } from "../lib/hotswapOffer";

const OFFER_TOAST_ID = "hotswap-offer";
const RESULT_TOAST_ID = "hotswap-result";
const STATE_POLL_MS = 1000;

const RESULT_COPY: Partial<Record<HotswapResultEvent["outcome"], { key: TranslationKey; ok: boolean }>> = {
  applied: { key: "hotswap_applied", ok: true },
  restart: { key: "hotswap_restart", ok: true },
  failed: { key: "hotswap_failed", ok: false },
};

function OfferToast({ offer, accent, toastId }: { offer: HotswapOffer; accent: string; toastId: string }) {
  const { t } = useTranslation();
  const [requested, setRequested] = useState(false);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const canApply = canApplyOffer(offer);

  // After Apply the agent either swaps at once (a result event closes the toast)
  // or reports busy-in-world while the player is in a world.
  useEffect(() => {
    if (!requested) return;
    let alive = true;
    const poll = async () => {
      const state = await window.api?.hotswapAgentState?.(offer.instanceId).catch(() => null);
      if (alive) setAgentState(state ?? null);
    };
    void poll();
    const id = setInterval(poll, STATE_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [requested, offer.instanceId]);

  const apply = async () => {
    setRequested(true);
    try {
      await window.api?.hotswapApply?.(offer.instanceId, offer.version);
    } catch (e) {
      console.log("[Hotswap] apply refused:", e);
      toast.dismiss(toastId);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">{t(canApply ? "hotswap_prompt" : "hotswap_restart")}</span>
      {showMenuHint(requested, agentState) && <span className="text-xs opacity-70">{t("hotswap_go_to_menu")}</span>}
      <div className="flex items-center gap-2">
        {canApply && (
          <button
            type="button"
            disabled={requested}
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
        if (result.outcome === "refused") toast.dismiss(OFFER_TOAST_ID);
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
