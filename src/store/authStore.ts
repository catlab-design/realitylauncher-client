import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AuthSession } from "../types/launcher";

interface AuthState {
  session: AuthSession | null;
  accounts: AuthSession[];

  setSession: (session: AuthSession | null) => void;
  setAccounts: (accounts: AuthSession[]) => void;
  addAccount: (account: AuthSession) => void;
  removeAccount: (uuid: string, authType: string) => void;
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

        let filteredAccounts = accounts.filter((a) => {
          if (a.uuid === account.uuid && a.authType === account.authType) return false;
          if (a.uuid === account.uuid && !a.authType) return false;
          if (a.authType === account.authType && a.username === account.username) {
            return false;
          }
          if (
            account.authType === "microsoft" &&
            account.catidLinked &&
            a.authType === "catid" &&
            !a.minecraftUuid &&
            a.username === account.username
          ) {
            return false;
          }

          return true;
        });

        set({ accounts: [...filteredAccounts, account] });
      },

      removeAccount: (uuid, authType) => {
        const { session, accounts } = get();
        const newAccounts = accounts.filter(
          (a) => !(a.uuid === uuid && a.authType === authType),
        );
        set({ accounts: newAccounts });

        if (session?.uuid === uuid && session?.authType === authType) {
          set({ session: null });
        }
      },

      updateAccount: (updatedAccount) => {
        set((state) => {
          const filteredAccounts = state.accounts.filter((a) => {
            if (
              a.uuid === updatedAccount.uuid &&
              a.authType === updatedAccount.authType
            )
              return false;

            if (
              a.authType === updatedAccount.authType &&
              a.username === updatedAccount.username
            )
              return false;

            if (
              updatedAccount.authType === "microsoft" &&
              updatedAccount.catidLinked &&
              a.authType === "catid" &&
              !a.minecraftUuid &&
              a.username === updatedAccount.username
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
      name: "reality_auth_store",
    },
  ),
);
