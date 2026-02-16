import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AuthSession } from "../types/launcher";

interface AuthState {
  session: AuthSession | null;
  accounts: AuthSession[];

  // Actions
  setSession: (session: AuthSession | null) => void;
  setAccounts: (accounts: AuthSession[]) => void;
  addAccount: (account: AuthSession) => void;
  removeAccount: (uuid: string, type: string) => void;
  updateAccount: (account: AuthSession) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      accounts: [],

      setSession: (session) => set({ session }),

      setAccounts: (accounts) => set({ accounts }),

      addAccount: (account) => {
        const { accounts } = get();

        // Robust Deduplication:
        // 1. Exact match (uuid + type)
        // 2. Cross-identity match (CatID account's minecraftUuid === Microsoft account's uuid)
        // 3. Token match (both using the same Reality API session)

        let filteredAccounts = accounts.filter((a) => {
          // Rule 1: Remove exact matches for the incoming account
          if (a.uuid === account.uuid && a.type === account.type) return false;

          // Rule 2: Cross-identity deduplication
          // If we are adding a Microsoft account, remove any CatID accounts that link to this same Minecraft UUID
          if (
            account.type === "microsoft" &&
            a.type === "catid" &&
            a.minecraftUuid === account.uuid
          ) {
            console.log(
              `[AuthStore] Deduplicating CatID account ${a.username} (Link matched to MS ${account.uuid})`,
            );
            return false;
          }

          // Inverse of Rule 2: If we are adding a Linked CatID account, remove any standalone MS accounts for the same UUID
          if (
            account.type === "catid" &&
            account.minecraftUuid === a.uuid &&
            a.type === "microsoft"
          ) {
            console.log(
              `[AuthStore] Deduplicating standalone MS account ${a.username} (CatID account already has this link)`,
            );
            return false;
          }

          // Rule 3: Session/Token deduplication (same underlying user account)
          if (
            account.apiToken &&
            a.apiToken === account.apiToken &&
            a.type !== account.type
          ) {
            return false;
          }

          // Username fallback (only if same type or one is basic CatID)
          if (
            a.username === account.username &&
            (a.type === account.type ||
              (a.type === "catid" && !a.minecraftUuid))
          ) {
            return false;
          }

          return true;
        });

        // Add the new/updated version
        set({ accounts: [...filteredAccounts, account] });
      },

      removeAccount: (uuid, type) => {
        const { session, accounts } = get();
        const newAccounts = accounts.filter(
          (a) => !(a.uuid === uuid && a.type === type),
        );
        set({ accounts: newAccounts });

        // If removing current session, logout
        if (session?.uuid === uuid && session?.type === type) {
          set({ session: null });
        }
      },

      updateAccount: (updatedAccount) => {
        set((state) => {
          // Perform the same robust deduplication as addAccount
          const filteredAccounts = state.accounts.filter((a) => {
            if (
              a.uuid === updatedAccount.uuid &&
              a.type === updatedAccount.type
            )
              return false;

            if (
              updatedAccount.type === "microsoft" &&
              a.type === "catid" &&
              a.minecraftUuid === updatedAccount.uuid
            )
              return false;

            if (
              updatedAccount.type === "catid" &&
              updatedAccount.minecraftUuid === a.uuid &&
              a.type === "microsoft"
            )
              return false;

            if (
              updatedAccount.apiToken &&
              a.apiToken === updatedAccount.apiToken &&
              a.type !== updatedAccount.type
            )
              return false;

            if (
              a.username === updatedAccount.username &&
              (a.type === updatedAccount.type ||
                (a.type === "catid" && !a.minecraftUuid))
            )
              return false;

            return true;
          });

          const newAccounts = [...filteredAccounts, updatedAccount];

          return {
            accounts: newAccounts,
            session:
              state.session?.uuid === updatedAccount.uuid ||
              state.session?.minecraftUuid === updatedAccount.uuid
                ? updatedAccount
                : state.session,
          };
        });
      },

      logout: () => set({ session: null }),
    }),
    {
      // Let's use 'reality_auth_store' to be clean.
      name: "reality_auth_store",
    },
  ),
);
