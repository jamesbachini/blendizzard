import { useNavigate } from 'react-router-dom'
import { useWalletStore } from '@/store/walletStore'

export default function ConnectPage() {
  const navigate = useNavigate()
  const { isConnecting, error, connect, clearError, pendingRedirect, setPendingRedirect } = useWalletStore()

  const handleConnect = async () => {
    const success = await connect()
    if (success) {
      // Redirect to pending URL or default to lobby
      const redirectTo = pendingRedirect || '/lobby'
      setPendingRedirect(null) // Clear the pending redirect
      navigate(redirectTo, { replace: true })
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
      {/* Hero */}
      <div className="text-center mb-12 animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-game-primary via-game-secondary to-game-accent flex items-center justify-center shadow-game-lg">
          <span className="text-white text-5xl font-bold">#</span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold mb-4">
          <span className="text-gradient">Number Guess</span>
        </h1>
        <p className="text-game-muted text-lg max-w-md mx-auto">
          Pick a number between 1-10. Closest to the winning number takes it all!
        </p>
      </div>

      {/* Pending game notice */}
      {pendingRedirect && (
        <div className="bg-game-primary/10 border border-game-primary/30 rounded-xl p-4 mb-6 max-w-sm w-full text-center animate-fade-in">
          <p className="text-game-primary text-sm font-medium">
            You've been invited to a game!
          </p>
          <p className="text-game-muted text-xs mt-1">
            Connect with Ohloss to join.
          </p>
        </div>
      )}

      {/* Connect Card */}
      <div className="card-elevated max-w-sm w-full animate-slide-up">
        <h2 className="font-display font-bold text-xl mb-4 text-center">
          {pendingRedirect ? 'Connect to Join Game' : 'Connect Your Wallet'}
        </h2>
        <p className="text-game-muted text-sm text-center mb-6">
          Connect with Ohloss to sign in or create a new account.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={clearError}
              className="text-red-500 text-xs underline mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          {isConnecting ? (
            <>
              <span className="spinner" />
              Connecting...
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Connect with Ohloss
            </>
          )}
        </button>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-3xl">
        <FeatureCard
          icon="🎲"
          title="Simple Rules"
          description="Pick a number 1-10. Closest to the random number wins!"
        />
        <FeatureCard
          icon="⚡"
          title="Fast Games"
          description="Games complete in seconds. No waiting around."
        />
        <FeatureCard
          icon="🏆"
          title="Fight for Your Faction"
          description="Every wager contributes FP to your faction. Lead the epoch, share the rewards!"
        />
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="card text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-game-text mb-1">{title}</h3>
      <p className="text-game-muted text-sm">{description}</p>
    </div>
  )
}
