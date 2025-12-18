import { create } from 'zustand'

interface TurnstileStore {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

/**
 * Shared headers object for Launchtube requests.
 * This is passed by reference to LaunchtubeClient, so mutations
 * to this object will be reflected in all future requests.
 */
export const launchtubeHeaders: Record<string, string> = {}

/**
 * Zustand store for managing Cloudflare Turnstile token.
 * The token is obtained from the Turnstile widget callback
 * and used for Launchtube transaction submissions.
 */
export const useTurnstileStore = create<TurnstileStore>((set) => ({
  token: null,
  setToken: (token: string) => {
    // Update the shared headers object for Launchtube
    launchtubeHeaders['X-Turnstile-Response'] = token
    set({ token })
  },
  clearToken: () => {
    delete launchtubeHeaders['X-Turnstile-Response']
    set({ token: null })
  },
}))

/**
 * Callback function for Cloudflare Turnstile widget.
 * Called by the Turnstile widget when a token is generated.
 */
export function turnstileCallback(token: string) {
  useTurnstileStore.getState().setToken(token)
}
