import { create } from 'zustand';

interface TurnstileStore {
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
}

/**
 * Zustand store for managing Cloudflare Turnstile token
 * The token is obtained from the Turnstile widget callback
 */
export const useTurnstileStore = create<TurnstileStore>((set) => ({
  token: null,
  setToken: (token: string) => set({ token }),
  clearToken: () => set({ token: null }),
}));

/**
 * Callback function for Cloudflare Turnstile widget
 * This will be called by the Turnstile widget when a token is generated
 */
export function turnstileCallback(token: string) {
  useTurnstileStore.getState().setToken(token);
}
