/**
 * Game Store - Manages game state for Number Guess
 */

import { create } from 'zustand'
import type { GameState, GamePhase, PlayerRole } from '@/types/game'

interface GameStoreState {
  // Game data
  sessionId: number | null
  gameState: GameState | null
  phase: GamePhase
  role: PlayerRole | null

  // UI state
  selectedNumber: number | null
  wagerInput: string
  isLoading: boolean
  error: string | null

  // Invite data (for sharing)
  inviteAuthXdr: string | null

  // Player info
  availableFp: bigint

  // Actions
  setSessionId: (id: number | null) => void
  setGameState: (state: GameState | null) => void
  setPhase: (phase: GamePhase) => void
  setRole: (role: PlayerRole | null) => void
  setSelectedNumber: (num: number | null) => void
  setWagerInput: (input: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setInviteAuthXdr: (xdr: string | null) => void
  setAvailableFp: (fp: bigint) => void
  reset: () => void
}

const initialState = {
  sessionId: null,
  gameState: null,
  phase: 'lobby' as GamePhase,
  role: null,
  selectedNumber: null,
  wagerInput: '',
  isLoading: false,
  error: null,
  inviteAuthXdr: null,
  availableFp: 0n,
}

export const useGameStore = create<GameStoreState>()((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setGameState: (state) => set({ gameState: state }),
  setPhase: (phase) => set({ phase }),
  setRole: (role) => set({ role }),
  setSelectedNumber: (num) => set({ selectedNumber: num }),
  setWagerInput: (input) => set({ wagerInput: input }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setInviteAuthXdr: (xdr) => set({ inviteAuthXdr: xdr }),
  setAvailableFp: (fp) => set({ availableFp: fp }),
  reset: () => set(initialState),
}))

// Derived state helpers
export function determineRole(
  address: string | null,
  gameState: GameState | null
): PlayerRole | null {
  if (!address || !gameState) return null
  if (gameState.player1 === address) return 'player1'
  if (gameState.player2 === address) return 'player2'
  return 'spectator'
}

export function determinePhase(
  gameState: GameState | null,
  role: PlayerRole | null
): GamePhase {
  if (!gameState) return 'lobby'

  // Game complete
  if (gameState.winner) return 'complete'

  // Both have guessed - ready to reveal
  if (gameState.player1Guess !== null && gameState.player2Guess !== null) {
    return 'revealing'
  }

  // Check if current player has guessed
  if (role === 'player1' && gameState.player1Guess !== null) {
    return 'waiting_guess'
  }
  if (role === 'player2' && gameState.player2Guess !== null) {
    return 'waiting_guess'
  }

  // Player can make a guess
  return 'guessing'
}
