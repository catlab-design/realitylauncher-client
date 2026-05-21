export const FIRST_RUN_LOGIN_PROMPT_KEY =
  "reality:first-run-login-prompt:v1";

interface FirstRunLoginPromptOptions {
  authBootstrapComplete: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  hasSession: boolean;
  accountCount: number;
  hasSeenPrompt: boolean;
  isAnyAuthFlowOpen: boolean;
}

export function hasSeenFirstRunLoginPrompt(
  storage?: Pick<Storage, "getItem"> | null,
): boolean {
  return storage?.getItem(FIRST_RUN_LOGIN_PROMPT_KEY) === "1";
}

export function markFirstRunLoginPromptSeen(
  storage?: Pick<Storage, "setItem"> | null,
): void {
  storage?.setItem(FIRST_RUN_LOGIN_PROMPT_KEY, "1");
}

export function shouldAutoOpenFirstRunLoginPrompt({
  authBootstrapComplete,
  isInitialized,
  isLoading,
  hasSession,
  accountCount,
  hasSeenPrompt,
  isAnyAuthFlowOpen,
}: FirstRunLoginPromptOptions): boolean {
  return (
    authBootstrapComplete &&
    isInitialized &&
    !isLoading &&
    !hasSession &&
    accountCount === 0 &&
    !hasSeenPrompt &&
    !isAnyAuthFlowOpen
  );
}
