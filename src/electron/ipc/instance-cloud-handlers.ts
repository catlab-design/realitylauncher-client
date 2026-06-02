import type { BrowserWindow, IpcMain } from "electron";

interface SessionLike {
  type?: "catid" | "microsoft";
  apiToken?: string | null;
}

export interface InstanceCloudHandlersDeps {
  ipcMain: IpcMain;
  getSession: () => SessionLike | null;
  getApiToken: () => string | undefined;
  refreshTokenIfNeeded: () => Promise<{ ok: boolean; newApiToken?: string; error?: string }>;
  getMainWindow: () => BrowserWindow | null;
  activeOperations: Map<string, AbortController>;
}

export function registerInstanceCloudHandlers(
  deps: InstanceCloudHandlersDeps,
): void {
  const { ipcMain, getSession, getApiToken, refreshTokenIfNeeded, getMainWindow, activeOperations } = deps;


  ipcMain.handle("instances-cloud-sync", async () => {
    try {
      const session = getSession();
      const apiToken = getApiToken();
      if (!session || !apiToken) {
        return { ok: false, error: "Not logged in or no API token" };
      }

      const { syncCloudInstances } = await import("../cloud-instances.js");
      await syncCloudInstances(apiToken);

      
      getMainWindow()?.webContents.send("instances-updated");

      return { ok: true };
    } catch (error: any) {
      console.error("[IPC] Cloud sync failed:", error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("instances-cloud-install", async (_event, id: string) => {
    let createdInstanceId: string | null = null;
    let mappedCancelId: string | null = null;
    const controller = new AbortController();
    const throwIfCancelled = () => {
      if (controller.signal.aborted) {
        throw new Error("Installation cancelled");
      }
    };

    
    activeOperations.set(id, controller);

    try {
      const session = getSession();
      const apiToken = getApiToken();
      if (!session || !apiToken) {
        return { ok: false, error: "Not logged in or no API token" };
      }

      const { fetchJoinedServers, syncServerMods } =
        await import("../cloud-instances.js");
      const { importCloudInstance, deleteInstance } =
        await import("../instances.js");

      console.log(`[Instances] Manually installing cloud instance: ${id}`);
      getMainWindow()?.webContents.send("install-progress", {
        type: "start",
        task: "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅ...",
      });
      throwIfCancelled();

      
      const data = await fetchJoinedServers(apiToken, controller.signal);
      throwIfCancelled();
      const allInstances = [...data.owned, ...data.member];

      
      const target = allInstances.find((i) => (i.storagePath || i.id) === id);

      if (target) {
        throwIfCancelled();
        const instance = await importCloudInstance(target);
        createdInstanceId = instance.id;
        getMainWindow()?.webContents.send("instances-updated");
        throwIfCancelled();

        
        
        const targetId = target.storagePath || target.id;
        console.log(
          `[Instances] Downloading content for: ${target.name} (ID: ${targetId})`,
        );

        
        if (targetId !== id) {
          mappedCancelId = targetId;
          activeOperations.set(targetId, controller);
        }

        try {
          await syncServerMods(
            targetId,
            apiToken,
            (progress) => {
              getMainWindow()?.webContents.send("install-progress", progress);
            },
            controller.signal,
          );

          
          createdInstanceId = null;
        } catch (syncError: any) {
          if (
            syncError.message === "Cancelled" ||
            syncError.message === "Download cancelled" ||
            syncError.message === "Installation cancelled"
          ) {
            throw new Error("Installation cancelled");
          }
          console.error("[Instances] Sync Error:", syncError);
          throw new Error(`Sync Failed: ${syncError?.message}`);
        }

        console.log(`[Instances] Installed successfully: ${target.name}`);
        getMainWindow()?.webContents.send("install-progress", {
          type: "complete",
          task: "เธ•เธดเธ”เธ•เธฑเนเธเน€เธชเธฃเนเธเธชเธดเนเธ",
          percent: 100,
        });
        return { ok: true };
      } else {
        return { ok: false, error: "Cloud Instance not found in your list." };
      }
    } catch (error: any) {
      
      if (createdInstanceId) {
        console.log(
          "[Instances] Installation failed or cancelled, cleaning up instance:",
          createdInstanceId,
        );
        try {
          const { deleteInstance } = await import("../instances.js");
          await deleteInstance(createdInstanceId);
          getMainWindow()?.webContents.send("instances-updated");
          console.log("[Instances] Cleanup complete");
        } catch (cleanupError) {
          console.error(
            "[Instances] Failed to cleanup instance:",
            cleanupError,
          );
        }
      }

      const cancelMsg = String(error?.message || "").toLowerCase();
      if (
        controller.signal.aborted ||
        cancelMsg.includes("cancelled") ||
        cancelMsg.includes("canceled")
      ) {
        getMainWindow()?.webContents.send("install-progress", {
          type: "cancelled",
          task: "ยกเลิกการดาวน์โหลดแล้ว",
          percent: 0,
        });
        return { ok: false, error: "Installation cancelled" };
      }

      console.error("[IPC] Cloud install failed:", error);
      return { ok: false, error: error?.message || "เธเธฒเธฃเธ•เธดเธ”เธ•เธฑเนเธเธฅเนเธกเน€เธซเธฅเธง" };
    } finally {
      activeOperations.delete(id);
      if (mappedCancelId && mappedCancelId !== id) {
        activeOperations.delete(mappedCancelId);
      }
    }
  },
  );

  ipcMain.handle("instances-get-joined", async () => {
    try {
      const session = getSession();
      console.log("[GetJoined] session type:", session?.type, "hasApiToken:", !!session?.apiToken);
      if (!session) {
        return { ok: false, error: "Not logged in" };
      }

      let apiToken = getApiToken();
      console.log("[GetJoined] apiToken from getApiToken():", !!apiToken);

      if (!apiToken && session.type === "microsoft") {
        console.log("[GetJoined] No apiToken for Microsoft session, attempting refresh...");
        const refreshResult = await refreshTokenIfNeeded();
        console.log("[GetJoined] refresh result:", refreshResult.ok, "newApiToken:", !!refreshResult.newApiToken, "error:", refreshResult.error);
        if (refreshResult.ok && refreshResult.newApiToken) {
          apiToken = refreshResult.newApiToken;
        }
      }

      if (!apiToken) {
        console.log("[GetJoined] Still no apiToken after refresh attempt");
        return { ok: false, error: "Not logged in or no API token" };
      }

      console.log("[GetJoined] Fetching with apiToken present:", !!apiToken);
      const { fetchJoinedServers } = await import("../cloud-instances.js");
      const data = await fetchJoinedServers(apiToken);
      return { ok: true, data };
    } catch (error: any) {
      console.error("[GetJoined] Error:", error.message);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("instance-leave", async (_event, instanceId: string) => {
    try {
      const session = getSession();
      const apiToken = getApiToken();
      if (!session || !apiToken) {
        return { ok: false, error: "Not logged in" };
      }

      const { leaveInstance } = await import("../cloud-instances.js");
      return await leaveInstance(instanceId, apiToken);
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("instance-join-public", async (_event, instanceId: string) => {
    try {
      const session = getSession();
      const apiToken = getApiToken();
      if (!session || !apiToken) {
        return { ok: false, error: "Not logged in" };
      }

      const { joinPublicInstance } = await import("../cloud-instances.js");
      return await joinPublicInstance(instanceId, apiToken);
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}
