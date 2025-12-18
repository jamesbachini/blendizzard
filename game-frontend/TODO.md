# Number Guess Game Frontend - Development TODO

## Overview

Building a standalone game frontend for the Number Guess game that communicates with the Ohloss wallet (frontend-v2) via popup window and postMessage.

**Architecture:**
- Game runs as standalone app on port 5174
- Opens popup to frontend-v2 (port 5173) for wallet connection and transaction signing
- Uses postMessage API for cross-window communication
- Ohloss passkey wallets only (no Freighter support)

**Visual Style:** Minimal Fun - clean design with pops of color and confetti effects

---

## Phase 1: Project Setup [COMPLETE]

- [x] Initialize Vite + React + TypeScript project
- [x] Configure Tailwind CSS v4
- [x] Set up environment variables
- [x] Copy/create contract bindings for number-guess and blendizzard
- [x] Install dependencies (stellar-sdk, etc.)

---

## Phase 2: Communication Protocol [COMPLETE]

### Message Types (Game → Wallet)

```typescript
interface ConnectRequest {
  type: 'CONNECT_REQUEST'
  origin: string
  appName: string
}

interface SignTransactionRequest {
  type: 'SIGN_TRANSACTION_REQUEST'
  requestId: string
  transactionXdr: string
  description: string
  submit?: boolean
}

interface SignAuthEntryRequest {
  type: 'SIGN_AUTH_ENTRY_REQUEST'
  requestId: string
  authEntryXdr: string
  description: string
}
```

### Message Types (Wallet → Game)

```typescript
interface ConnectResponse {
  type: 'CONNECT_RESPONSE'
  success: boolean
  address?: string
  error?: string
}

interface SignTransactionResponse {
  type: 'SIGN_TRANSACTION_RESPONSE'
  requestId: string
  success: boolean
  signedXdr?: string
  txHash?: string
  error?: string
}

interface SignAuthEntryResponse {
  type: 'SIGN_AUTH_ENTRY_RESPONSE'
  requestId: string
  success: boolean
  signedAuthEntryXdr?: string
  error?: string
}
```

### Completed Tasks

- [x] Define message type interfaces (`src/types/messages.ts`)
- [x] Create `walletBridge.ts` - handles popup management and message passing
- [x] Implement connection flow with timeout handling
- [x] Implement sign request/response flow
- [x] Implement auth entry signing flow
- [x] Add error handling and retry logic

---

## Phase 3: Wallet Signer View (in frontend-v2) [COMPLETE]

- [x] Create `/signer` route in frontend-v2
- [x] Build SignerPage component that listens for postMessage
- [x] Display connection requests with approve/reject UI
- [x] Display transaction details for signing requests
- [x] Implement signing via smart-account-kit
- [x] Send responses back to game window
- [x] Handle multiple pending requests
- [x] Add visual feedback for signing status

---

## Phase 4: Game Connection Flow [COMPLETE]

- [x] Create WalletStore for game app (Zustand)
- [x] Implement "Connect Wallet" button that opens popup
- [x] Display connected state with address
- [x] Handle disconnection
- [x] Persist connection state (localStorage via Zustand persist)
- [x] Show connection status indicator in Header

---

## Phase 5: Game UI Components [COMPLETE]

### Main Views

- [x] **ConnectPage** - Logo, connect wallet button
- [x] **LobbyPage** - Create game / Join game options
- [x] **GamePage** - Unified page handling all game phases:
  - Creating game
  - Waiting for opponent (with invite link)
  - Joining game
  - Guessing phase (number selector)
  - Waiting for opponent's guess
  - Revealing winner
  - Results with confetti

### Components

- [x] Header (logo, wallet status, disconnect)
- [x] NumberSelector (1-10 buttons with hover effects)
- [x] PlayerCard (shows player info, wager, guess status)
- [x] ShareInvite (copy invite URL)
- [x] Confetti (winner celebration using canvas-confetti)

---

## Phase 6: Contract Integration [COMPLETE]

### Services

- [x] Create `numberGuessService.ts`
  - `prepareStartGame()` - Build and prepare game start transaction
  - `makeGuess()` - Submit player's guess
  - `revealWinner()` - Trigger winner determination
  - `getGame()` - Query game state
  - `parseAuthEntry()` - Parse auth entry from signed XDR

### Transaction Flow

- [x] Player 1: Create game → Sign auth entry → Export invite
- [x] Player 2: Import invite → Sign auth entry → Submit transaction
- [x] Both: Make guess → Sign and submit
- [x] Either: Reveal winner → Sign and submit

---

## Phase 7: Visual Polish [COMPLETE]

- [x] Design color palette (game-primary, game-secondary, game-accent)
- [x] Add micro-interactions (button hovers, clicks, scale transforms)
- [x] Implement confetti on win (canvas-confetti)
- [x] Add smooth page transitions
- [x] Loading states with spinner animations
- [x] Badges for status display (success, warning, info, error)

---

## Phase 8: Testing & Polish [IN PROGRESS]

- [ ] Test full game flow (2 browsers)
- [ ] Test error scenarios (network issues, popup blocked)
- [ ] Test reconnection after page reload
- [ ] Mobile responsiveness
- [ ] Performance optimization

---

## How to Test Locally

### Prerequisites

1. Both frontend-v2 and game-frontend need to be running
2. You need contract addresses configured in `.env` files

### Step 1: Set up environment files

**game-frontend/.env:**
```env
VITE_RPC_URL=https://rpc.lightsail.network
VITE_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
VITE_NUMBER_GUESS_CONTRACT=<your-contract-address>
VITE_BLENDIZZARD_CONTRACT=<your-contract-address>
VITE_OHLOSS_URL=http://localhost:5173
```

### Step 2: Start both dev servers

Terminal 1 (Wallet - frontend-v2):
```bash
cd frontend-v2
bun run dev
# Runs on http://localhost:5173
```

Terminal 2 (Game):
```bash
cd game-frontend
bun run dev
# Runs on http://localhost:5174
```

### Step 3: Test the flow

1. Open http://localhost:5174 in Browser 1 (Player 1)
2. Click "Connect Wallet" - popup opens to frontend-v2
3. Authenticate with passkey in popup
4. Go to Lobby → Create Game
5. Copy the invite link

6. Open http://localhost:5174 in Browser 2 (Player 2 - different browser/incognito)
7. Connect wallet
8. Paste invite link in "Join Game"

9. Both players pick numbers and submit
10. Either player can reveal winner
11. Winner gets confetti!

---

## Technical Notes

### Environment Variables

```env
VITE_RPC_URL=https://rpc.lightsail.network
VITE_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
VITE_NUMBER_GUESS_CONTRACT=...
VITE_BLENDIZZARD_CONTRACT=...
VITE_OHLOSS_URL=http://localhost:5173  # frontend-v2 URL for popup
```

### Key Files

```
game-frontend/
├── src/
│   ├── App.tsx                    # Main app with router
│   ├── main.tsx                   # Entry point
│   ├── index.css                  # Tailwind + custom styles
│   ├── vite-env.d.ts              # TypeScript env types
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── NumberSelector.tsx
│   │   ├── PlayerCard.tsx
│   │   ├── ShareInvite.tsx
│   │   └── Confetti.tsx
│   ├── pages/
│   │   ├── ConnectPage.tsx
│   │   ├── LobbyPage.tsx
│   │   └── GamePage.tsx
│   ├── services/
│   │   ├── numberGuessService.ts
│   │   └── walletBridge.ts        # Cross-window communication
│   ├── store/
│   │   ├── walletStore.ts
│   │   └── gameStore.ts
│   └── types/
│       ├── messages.ts            # postMessage types
│       └── game.ts                # Game state types
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── TODO.md
```

### Cross-Origin Considerations

- Popup runs on different port (5173) than game (5174)
- postMessage origin validation in both directions
- For local dev: Game on :5174, Wallet on :5173
- Production: Configure allowed origins appropriately

---

## Progress Log

| Date | Status | Notes |
|------|--------|-------|
| Dec 2024 | Complete | All phases implemented, ready for integration testing |
