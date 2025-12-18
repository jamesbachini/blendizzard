/**
 * Wallet Store - Manages wallet connection state
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { walletBridge } from '@/services/walletBridge'

interface WalletState {
  // Connection state
  address: string | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null

  // Redirect state - stores URL to redirect to after connection
  pendingRedirect: string | null

  // Actions
  connect: () => Promise<boolean>
  disconnect: () => void
  clearError: () => void
  setPendingRedirect: (url: string | null) => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      address: null,
      isConnected: false,
      isConnecting: false,
      error: null,
      pendingRedirect: null,

      connect: async () => {
        if (get().isConnecting) return false

        set({ isConnecting: true, error: null })

        const result = await walletBridge.connect()

        if ('error' in result) {
          set({
            isConnecting: false,
            error: result.error,
          })
          return false
        }

        set({
          address: result.address,
          isConnected: true,
          isConnecting: false,
          error: null,
        })
        return true
      },

      disconnect: () => {
        walletBridge.closePopup()
        set({
          address: null,
          isConnected: false,
          isConnecting: false,
          error: null,
          pendingRedirect: null,
        })
      },

      clearError: () => set({ error: null }),

      setPendingRedirect: (url) => set({ pendingRedirect: url }),
    }),
    {
      name: 'number-guess-wallet',
      partialize: (state) => ({
        address: state.address,
        isConnected: state.isConnected,
        pendingRedirect: state.pendingRedirect,
      }),
    }
  )
)
