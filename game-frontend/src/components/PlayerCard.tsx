import { formatAddress, formatWager } from '@/types/game'

interface PlayerCardProps {
  label: string
  address: string
  wager: bigint
  hasGuessed: boolean
  isYou?: boolean
  guess?: number
  showGuess?: boolean
}

export default function PlayerCard({
  label,
  address,
  wager,
  hasGuessed,
  isYou,
  guess,
  showGuess,
}: PlayerCardProps) {
  return (
    <div
      className={`
        card relative overflow-hidden
        ${isYou ? 'border-2 border-game-primary' : ''}
      `}
    >
      {isYou && (
        <div className="absolute top-0 right-0 bg-game-primary text-white text-xs px-2 py-1 rounded-bl-lg">
          You
        </div>
      )}

      <p className="text-game-muted text-sm mb-1">{label}</p>
      <p className="font-mono text-sm mb-2">{formatAddress(address)}</p>

      <div className="flex items-center justify-between mt-3">
        <div>
          <p className="text-game-muted text-xs">Wager</p>
          <p className="font-semibold">{formatWager(wager)} FP</p>
        </div>

        <div className="flex items-center gap-2">
          {showGuess && guess !== undefined ? (
            <div className="w-12 h-12 rounded-xl bg-game-primary text-white flex items-center justify-center font-bold text-xl">
              {guess}
            </div>
          ) : hasGuessed ? (
            <div className="badge badge-success">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Guessed
            </div>
          ) : (
            <div className="badge badge-warning">
              <svg className="w-4 h-4 mr-1 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Waiting
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
