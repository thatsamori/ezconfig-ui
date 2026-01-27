import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from '@/lib/auth/types';

export interface AuthUser {
  username: string;
  role: UserRole;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (username: string, password: string): Promise<boolean> => {
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          if (!response.ok) {
            return false;
          }

          const data = await response.json();
          set({
            token: data.token,
            user: { username: data.username, role: data.role },
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        } catch {
          return false;
        }
      },

      logout: async (): Promise<void> => {
        const { token } = get();
        if (token) {
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
          } catch {
            // Ignore logout errors
          }
        }
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      checkAuth: async (): Promise<void> => {
        const { token } = get();
        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          const response = await fetch('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            // Invalid token, clear auth
            set({
              token: null,
              user: null,
              isAuthenticated: false,
              isLoading: false,
            });
            return;
          }

          const data = await response.json();
          set({
            user: { username: data.username, role: data.role },
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Network error, clear auth
          set({
            token: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearAuth: (): void => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },
    }),
    {
      name: 'ezconfig-auth',
      // Only persist token - user is fetched via checkAuth on hydration
      partialize: (state) => ({ token: state.token }),
      // On hydration, set isLoading=true and call checkAuth
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.checkAuth();
        }
      },
    }
  )
);
