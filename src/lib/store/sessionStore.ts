import { create } from 'zustand';

/** The signed-in server owner, as `/api/auth/session` describes them. */
export interface SessionUser {
  name: string;
  avatarUrl: string;
  operator: boolean;
}

export interface SessionState {
  user: SessionUser | null;
  status: 'loading' | 'signed-in' | 'signed-out';

  // Actions
  load: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

// The session lives in an HttpOnly cookie the browser sends by itself; this
// store only holds who it belongs to, and nothing is kept in localStorage.
export const useSessionStore = create<SessionState>()(set => {
  const end = async (path: string) => {
    const response = await fetch(path, { method: 'POST' });
    if (!response.ok && response.status !== 401) throw new Error('Could not sign out. Try again.');
    set({ user: null, status: 'signed-out' });
  };
  return {
    user: null,
    status: 'loading',
    load: async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) {
          set({ user: null, status: 'signed-out' });
          return;
        }
        const data = await response.json();
        set({ user: data.user, status: 'signed-in' });
      } catch {
        set({ user: null, status: 'signed-out' });
      }
    },
    signOut: () => end('/api/auth/sign-out'),
    signOutEverywhere: () => end('/api/auth/sign-out-everywhere'),
  };
});
