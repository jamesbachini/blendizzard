import { useState } from 'react'

interface ShareInviteProps {
  sessionId: number
  authXdr: string
  wager: string
}

export default function ShareInvite({ sessionId, authXdr, wager }: ShareInviteProps) {
  const [copied, setCopied] = useState(false)

  // Build invite URL
  const inviteUrl = `${window.location.origin}/game/${sessionId}?mode=join&auth=${encodeURIComponent(authXdr)}&wager=${wager}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Number Guess Challenge',
          text: `Join my Number Guess game! Session #${sessionId}`,
          url: inviteUrl,
        })
      } catch (err) {
        // User cancelled or share failed
        console.log('Share cancelled or failed:', err)
      }
    } else {
      handleCopy()
    }
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">Share Invite Link</h3>

      <div className="bg-gray-50 rounded-xl p-3 mb-4 overflow-hidden">
        <p className="text-sm font-mono text-game-muted break-all line-clamp-2">
          {inviteUrl}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleCopy}
          className={`btn flex-1 flex items-center justify-center ${copied ? 'btn-outline border-game-accent text-game-accent' : 'btn-outline'}`}
        >
          {copied ? (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Link
            </>
          )}
        </button>

        <button onClick={handleShare} className="btn btn-primary flex-1 flex items-center justify-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </button>
      </div>

      <p className="text-game-muted text-xs mt-3 text-center">
        Send this link to your opponent to join the game
      </p>
    </div>
  )
}
