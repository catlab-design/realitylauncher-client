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

        // Deduplication:
        // 1. Exact match (uuid + type)
        // 2. Username fallback for same-type/basic CatID accounts

        let filteredAccounts = accounts.filter((a) => {
          // Rule 1: Remove exact matches for the incoming account
          if (a.uuid === account.uuid && a.type === account.type) return false;

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
          // Perform the same deduplication as addAccount
          const filteredAccounts = state.accounts.filter((a) => {
            if (
              a.uuid === updatedAccount.uuid &&
              a.type === updatedAccount.type
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
