import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type AuthSession } from '../types/launcher';

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
                const exists = accounts.some(a => a.uuid === account.uuid && a.type === account.type);

                if (exists) {
                    // Update instead of just doing nothing
                    set((state) => ({
                        accounts: state.accounts.map(a =>
                            (a.uuid === account.uuid && a.type === account.type) ? account : a
                        )
                    }));
                } else {
                    set({ accounts: [...accounts, account] });
                }
            },

            removeAccount: (uuid, type) => {
                const { session, accounts } = get();
                const newAccounts = accounts.filter(a => !(a.uuid === uuid && a.type === type));
                set({ accounts: newAccounts });

                // If removing current session, logout
                if (session?.uuid === uuid && session?.type === type) {
                    set({ session: null });
                }
            },

            updateAccount: (updatedAccount) => {
                set((state) => ({
                    accounts: state.accounts.map(acc =>
                        (acc.uuid === updatedAccount.uuid && acc.type === updatedAccount.type)
                            ? updatedAccount
                            : acc
                    ),
                    // Also update session if it matches
                    session: (state.session?.uuid === updatedAccount.uuid && state.session?.type === updatedAccount.type)
                        ? updatedAccount
                        : state.session
                }));
            },

            logout: () => set({ session: null })
        }),
        {
            // Let's use 'reality_auth_store' to be clean.
            name: 'reality_auth_store'
        }
    )
);
