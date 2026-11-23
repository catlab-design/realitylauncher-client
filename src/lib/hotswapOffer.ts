export type AgentState = "idle" | "ready" | "applying" | "busy-in-world";

/** Apply is clickable whenever the offer has live changes; the agent itself waits for the main menu. */
export function canApplyOffer(offer: { liveCount: number; revoked?: boolean }): boolean {
  return offer.liveCount > 0 && !offer.revoked;
}

/** Show "go to the main menu" only after an Apply click the agent parked because the player is in a world. */
export function showMenuHint(applyRequested: boolean, state: AgentState | null): boolean {
  return applyRequested && state === "busy-in-world";
}
