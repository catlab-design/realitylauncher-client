export interface MicrosoftDeviceCodeResult {
  ok: boolean;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  expiresIn?: number;
  error?: string;
}

export interface MicrosoftDeviceCodeData {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

interface ToastLike {
  loading: (message: string) => unknown;
  dismiss: (toastId?: unknown) => void;
  error: (message: string) => void;
}

interface StartMicrosoftLoginFlowOptions {
  startDeviceCodeAuth?: () => Promise<MicrosoftDeviceCodeResult>;
  setLoginDialogOpen: (open: boolean) => void;
  setDeviceCodeData: (data: MicrosoftDeviceCodeData | null) => void;
  setDeviceCodeError: (error: string | null) => void;
  setDeviceCodeModalOpen: (open: boolean) => void;
  setDeviceCodePolling: (polling: boolean) => void;
  toast: ToastLike;
  t: (key: string) => string;
  now?: () => number;
  logError?: (...args: unknown[]) => void;
}

export async function startMicrosoftLoginFlow({
  startDeviceCodeAuth,
  setLoginDialogOpen,
  setDeviceCodeData,
  setDeviceCodeError,
  setDeviceCodeModalOpen,
  setDeviceCodePolling,
  toast,
  t,
  now = () => Date.now(),
  logError,
}: StartMicrosoftLoginFlowOptions): Promise<boolean> {
  if (!startDeviceCodeAuth) {
    setLoginDialogOpen(true);
    toast.error(t("ms_login_requires_electron"));
    return false;
  }

  const toastId = toast.loading(t("requesting_login_code"));

  try {
    const result = await startDeviceCodeAuth();
    toast.dismiss(toastId);

    if (!result.ok || !result.deviceCode || !result.userCode) {
      setLoginDialogOpen(true);
      setDeviceCodeModalOpen(false);
      setDeviceCodePolling(false);
      setDeviceCodeData(null);
      toast.error(t("request_code_failed"));
      return false;
    }

    setDeviceCodeData({
      deviceCode: result.deviceCode,
      userCode: result.userCode,
      verificationUri:
        result.verificationUri || "https://microsoft.com/devicelogin",
      expiresAt: now() + (result.expiresIn || 900) * 1000,
    });
    setDeviceCodeError(null);
    setDeviceCodeModalOpen(true);
    setDeviceCodePolling(true);
    setLoginDialogOpen(false);
    return true;
  } catch (error) {
    toast.dismiss(toastId);
    setLoginDialogOpen(true);
    setDeviceCodeModalOpen(false);
    setDeviceCodePolling(false);
    setDeviceCodeData(null);
    logError?.("[Auth] Error starting device code flow:", error);
    toast.error(t("start_login_failed"));
    return false;
  }
}
