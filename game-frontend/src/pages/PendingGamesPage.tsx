import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWalletStore } from '@/store/walletStore'
import { usePendingGamesStore, type PendingGame, type PendingGameStatus } from '@/store/pendingGamesStore'
import { formatWager } from '@/types/game'
import * as numberGuessService from '@/services/numberGuessService'

function getStatusBadge(game: PendingGame) {
  switch (game.status) {
    case 'waiting_for_player2':
      return (
        <span className="badge badge-warning">
          ⏳ Waiting for opponent
        </span>
      )
    case 'ready_to_play':
      return (
        <span className="badge badge-info">
          🎮 Your turn
        </span>
      )
    case 'waiting_for_guess':
      return (
        <span className="badge badge-muted">
          ⏳ Waiting for opponent's guess
        </span>
      )
    case 'ready_to_reveal':
      return (
        <span className="badge badge-success">
          🎲 Ready to reveal!
        </span>
      )
    case 'complete':
      if (game.didWin === true) {
        return (
          <span className="badge badge-success">
            🏆 You Won!
          </span>
        )
      } else if (game.didWin === false) {
        return (
          <span className="badge badge-error">
            😢 You Lost
          </span>
        )
      }
      return (
        <span className="badge badge-default">
          ✓ Complete
        </span>
      )
    default:
      return null
  }
}

function getActionButton(game: PendingGame, navigate: (path: string) => void) {
  switch (game.status) {
    case 'waiting_for_player2':
      return (
        <button
          onClick={() => navigate(`/game/${game.sessionId}`)}
          className="btn btn-secondary text-sm"
        >
          Share Invite
        </button>
      )
    case 'ready_to_play':
    case 'waiting_for_guess':
      return (
        <button
          onClick={() => navigate(`/game/${game.sessionId}`)}
          className="btn btn-primary text-sm"
        >
          Continue Playing
        </button>
      )
    case 'ready_to_reveal':
      return (
        <button
          onClick={() => navigate(`/game/${game.sessionId}`)}
          className="btn btn-accent text-sm"
        >
          Reveal Winner
        </button>
      )
    case 'complete':
      return (
        <button
          onClick={() => navigate(`/game/${game.sessionId}`)}
          className="btn btn-default text-sm"
        >
          View Result
        </button>
      )
    default:
      return null
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatInviteRemaining(
  currentLedger: number | null,
  expirationLedger?: number
): { label: string; expired: boolean } | null {
  if (!expirationLedger) return null
  if (!currentLedger) return { label: 'Invite validity: unknown', expired: false }

  const remainingLedgers = expirationLedger - currentLedger
  const remainingSeconds = remainingLedgers * 5

  if (remainingSeconds <= 0) return { label: 'Invite expired', expired: true }

  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)

  if (hours > 0) return { label: `Invite valid for ${hours}h ${minutes}m`, expired: false }
  return { label: `Invite valid for ${minutes}m`, expired: false }
}

export default function PendingGamesPage() {
  const navigate = useNavigate()
  const { address } = useWalletStore()
  const { getGamesForPlayer, clearOldGames, removeGame, updateGameStatus, updateGame } = usePendingGamesStore()

  const [games, setGames] = useState<PendingGame[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [currentLedger, setCurrentLedger] = useState<number | null>(null)

  // Load and refresh games on mount
  useEffect(() => {
    if (!address) return

    // Clear old games (older than 48 hours)
    clearOldGames(48)

    // Load games for this player
    const playerGames = getGamesForPlayer(address)
    setGames(playerGames)

    // Best-effort: fetch current ledger for invite TTL display
    numberGuessService.getLatestLedgerSequence().then(setCurrentLedger)

    // Refresh status for each game by checking on-chain state
    refreshGameStatuses(playerGames)
  }, [address, clearOldGames, getGamesForPlayer])

  const refreshGameStatuses = async (gamesToRefresh: PendingGame[]) => {
    if (gamesToRefresh.length === 0) return
    
    setIsRefreshing(true)

    try {
      // Batch all game lookups into a single RPC call
      const sessionIds = gamesToRefresh.map(g => g.sessionId)
      const [gameStates, latestLedger] = await Promise.all([
        numberGuessService.getGamesBatched(sessionIds),
        numberGuessService.getLatestLedgerSequence(),
      ])

      setCurrentLedger(latestLedger)

      // Update each game based on its on-chain state
      for (const game of gamesToRefresh) {
        const state = gameStates.get(game.sessionId)

        if (state) {
          // Game exists on chain - update status
          if (state.winner) {
            // Save winner info along with status and guesses
            const isPlayer1 = state.player1 === game.playerAddress
            updateGame(game.sessionId, game.playerAddress, {
              status: 'complete',
              winner: state.winner,
              winningNumber: state.winningNumber ?? undefined,
              didWin: state.winner === game.playerAddress,
              yourGuess: isPlayer1 ? (state.player1Guess ?? undefined) : (state.player2Guess ?? undefined),
              opponentGuess: isPlayer1 ? (state.player2Guess ?? undefined) : (state.player1Guess ?? undefined),
            })
          } else if (state.player1Guess !== null && state.player2Guess !== null) {
            updateGameStatus(game.sessionId, game.playerAddress, 'ready_to_reveal')
          } else {
            const isPlayer1 = state.player1 === game.playerAddress
            const hasGuessed = isPlayer1
              ? state.player1Guess !== null
              : state.player2Guess !== null

            if (hasGuessed) {
              updateGameStatus(game.sessionId, game.playerAddress, 'waiting_for_guess')
            } else {
              updateGameStatus(game.sessionId, game.playerAddress, 'ready_to_play')
            }
          }
        }
        // If game doesn't exist on chain, keep existing status (waiting_for_player2)
      }
    } catch (err) {
      console.error('[refreshGameStatuses] Error:', err)
    }

    // Reload games after refresh
    if (address) {
      setGames(getGamesForPlayer(address))
    }
    setIsRefreshing(false)
  }

  const handleRemoveGame = (sessionId: number) => {
    if (!address) return
    removeGame(sessionId, address)
    setGames(getGamesForPlayer(address))
  }

  // Filter out complete games older than 1 hour
  const activeGames = games.filter(
    (g) => g.status !== 'complete' || Date.now() - g.createdAt < 3600000
  )

  // Sort by status priority (action needed first) then by creation time
  const statusPriority: Record<PendingGameStatus, number> = {
    ready_to_reveal: 0,
    ready_to_play: 1,
    waiting_for_guess: 2,
    waiting_for_player2: 3,
    complete: 4,
  }

  const sortedGames = [...activeGames].sort((a, b) => {
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
    if (priorityDiff !== 0) return priorityDiff
    return b.createdAt - a.createdAt
  })

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/lobby')}
          className="flex items-center gap-2 text-game-muted hover:text-game-text transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Lobby
        </button>

        <button
          onClick={() => address && refreshGameStatuses(getGamesForPlayer(address))}
          disabled={isRefreshing}
          className="btn btn-default text-sm"
        >
          {isRefreshing ? (
            <>
              <span className="spinner mr-2" />
              Refreshing...
            </>
          ) : (
            '🔄 Refresh'
          )}
        </button>
      </div>

      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Your Games</h1>
        <p className="text-game-muted">
          {sortedGames.length === 0
            ? 'No pending games'
            : `${sortedGames.length} game${sortedGames.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {sortedGames.length === 0 ? (
        <div className="card-elevated text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-game-primary/10 flex items-center justify-center">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="font-display font-bold text-xl mb-2">No Games Yet</h2>
          <p className="text-game-muted mb-6">
            Create a new game to get started!
          </p>
          <button
            onClick={() => navigate('/lobby')}
            className="btn btn-primary"
          >
            Go to Lobby
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGames.map((game) => (
            <div
              key={`${game.sessionId}-${game.playerAddress}`}
              className="card-elevated hover:shadow-game-lg transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-display font-bold text-lg">
                      Game #{game.sessionId}
                    </span>
                    {getStatusBadge(game)}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-game-muted">
                    <span>
                      {game.role === 'player1' ? '👤 You created' : '👥 You joined'}
                    </span>
                    <span>•</span>
                    <span>
                      Wager: {formatWager(BigInt(parseFloat(game.wager) * 10_000_000))} FP
                    </span>
                    <span>•</span>
                    <span>{formatTimeAgo(game.createdAt)}</span>
                  </div>

                  {game.status === 'waiting_for_player2' && game.role === 'player1' && (
                    (() => {
                      const info = formatInviteRemaining(currentLedger, game.authExpirationLedger)
                      if (!info) return null
                      return (
                        <p
                          className={`text-xs mt-1 ${
                            info.expired ? 'text-red-600' : 'text-game-muted'
                          }`}
                        >
                          {info.label}
                        </p>
                      )
                    })()
                  )}

                  {game.opponentAddress && (
                    <p className="text-xs text-game-muted mt-1 font-mono truncate">
                      vs {game.opponentAddress.slice(0, 8)}...{game.opponentAddress.slice(-4)}
                    </p>
                  )}

                  {game.status === 'complete' && (
                    <p className="text-xs text-game-muted mt-1">
                      {game.yourGuess !== undefined && (
                        <>You guessed <span className="font-bold">{game.yourGuess}</span></>
                      )}
                      {game.yourGuess !== undefined && game.opponentGuess !== undefined && ' • '}
                      {game.opponentGuess !== undefined && (
                        <>They guessed <span className="font-bold">{game.opponentGuess}</span></>
                      )}
                      {game.winningNumber !== undefined && (
                        <> • Winner: <span className="font-bold">{game.winningNumber}</span></>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {getActionButton(game, navigate)}

                  <button
                    onClick={() => handleRemoveGame(game.sessionId)}
                    className="p-2 text-game-muted hover:text-red-500 transition-colors"
                    title="Remove from list"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
