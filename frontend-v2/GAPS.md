# Frontend-v2 Implementation Gaps

This document outlines the gaps, known issues, and remaining work for the Blendizzard frontend-v2.

## Implemented Features

### Core Infrastructure
- [x] Smart-account-kit integration for WebAuthn passkey wallets
- [x] Contract service using blendizzard/fee-vault bindings
- [x] Zustand store with localStorage persistence for user preferences
- [x] RPC utilities with batch getLedgerEntries (200 key limit)
- [x] Mainnet configuration in .env

### Account Page UI
- [x] Player/Developer toggle checkboxes (persisted to localStorage)
- [x] Epoch section with countdown timer
- [x] Cycle epoch button (when epoch has ended)
- [x] Faction standings with 30-second auto-refresh
- [x] Game Library modal (mocked data)
- [x] Wallet Holdings section (XLM, USDC balances)
- [x] Vault section (deposited USDC, available FP, contributed FP)
- [x] Multiplier breakdown (amount + time multipliers)
- [x] Minimum deposit warning for claiming
- [x] Deposit/Withdraw modals with 50% withdrawal warning
- [x] Faction selection (current epoch locked vs next epoch selection)
- [x] Player rewards section with claim buttons
- [x] Developer rewards section with claim buttons

## Known Gaps & Issues

### 1. Developer Game Address Configuration
**Status:** Hardcoded empty array
**Location:** `AccountPage.tsx:89`
```tsx
const [devGameAddresses] = useState<string[]>([])
```
**Problem:** Developers need a way to register/configure their game contract addresses.
**Solution needed:**
- Add UI for developers to input their game contract addresses
- Persist game addresses to localStorage
- Consider a "My Games" management section

### 2. Fee Vault Deposit/Withdraw Integration
**Status:** Uses mock fee-vault client
**Location:** `contractService.ts:384-456`
**Problem:** The fee-vault bindings may need verification for the deposit/withdraw method signatures.
**Action needed:**
- Verify fee-vault bindings match the deployed contract
- Test actual deposit/withdraw transactions on mainnet

### 3. Reward Claim Verification
**Status:** Simulation-based estimation
**Location:** `contractService.ts:648-715` (player rewards), `contractService.ts:751-840` (dev rewards)
**Problem:** Rewards are calculated via client-side estimation. The contract may reject claims if:
- Reward already claimed
- Player/game not eligible
**Action needed:**
- Add proper claimed status checking (currently skipped per user request)
- Handle claim errors gracefully in UI

### 4. Game Library
**Status:** Mocked data only
**Location:** `AccountPage.tsx:31-35`
```tsx
const MOCK_GAMES = [
  { id: 'coin-flip', name: 'COIN FLIP', status: 'LIVE', players: 142 },
  ...
]
```
**Action needed:**
- Integrate with actual game registry from contract
- Add game links/launch functionality

### 5. Transaction Error Handling
**Status:** Basic error messages
**Problem:** Smart-account-kit errors may not be user-friendly.
**Action needed:**
- Parse Soroban contract errors into human-readable messages
- Add retry logic for transient failures
- Handle insufficient balance errors specifically

### 6. Loading States
**Status:** Basic loading indicators
**Problem:** Individual section loading states could be more granular.
**Action needed:**
- Add skeleton loaders for each section
- Show stale data while refreshing

### 7. Mobile Responsiveness
**Status:** Basic responsive grid
**Problem:** Some UI elements may not render optimally on small screens.
**Action needed:**
- Test on various device sizes
- Adjust modal positioning for mobile

## Configuration Requirements

### Mainnet Deployment
The following environment variables must be set for mainnet:

```env
VITE_RPC_URL=https://rpc.lightsail.network
VITE_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
VITE_ACCOUNT_WASM_HASH=<mainnet-wasm-hash>
VITE_WEBAUTHN_VERIFIER_ADDRESS=<mainnet-verifier>
VITE_NATIVE_TOKEN_CONTRACT=<mainnet-xlm-sac>
VITE_BLENDIZZARD_CONTRACT=<mainnet-blendizzard>
VITE_FEE_VAULT_CONTRACT=<mainnet-fee-vault>
VITE_USDC_TOKEN_CONTRACT=<mainnet-usdc>
```

## Testing Checklist

Before production deployment:

- [ ] Create wallet with passkey
- [ ] Connect existing wallet
- [ ] View epoch info and countdown
- [ ] View faction standings
- [ ] Cycle epoch (when ended)
- [ ] Select/change faction
- [ ] Deposit USDC to vault
- [ ] Withdraw USDC from vault (test 50% warning)
- [ ] View player rewards
- [ ] Claim player reward
- [ ] View dev rewards (with registered game)
- [ ] Claim dev reward

## Architecture Notes

### Data Flow
1. `blendizzardStore.ts` - Zustand store manages all state
2. `contractService.ts` - Uses bindings for transactions, raw RPC for batch reads
3. `stellar.ts` - Low-level RPC utilities for direct ledger queries
4. `smartAccount.ts` - Singleton smart-account-kit instance

### Why Two RPC Approaches?
- **Bindings** (`contractService.ts`): Used for transactions that need signing
- **Direct RPC** (`stellar.ts`, `blendizzardStore.ts`): Used for batch read operations where we need to fetch up to 200 keys per request for rewards

### Storage Keys
The contract uses these DataKey variants:
- `Player(Address)` - Persistent player data
- `EpochPlayer(u32, Address)` - Per-epoch player data
- `Epoch(u32)` - Epoch metadata
- `EpochGame(u32, Address)` - Per-epoch game statistics
- `Config` - Instance storage configuration

## Future Enhancements

1. **Real-time Updates**: WebSocket subscription for epoch/standings changes
2. **Transaction History**: Show past deposits/withdrawals/claims
3. **Multiplier Calculator**: Preview FP based on potential deposit amounts
4. **Faction Leaderboards**: Show top contributors per faction
5. **Game Integration**: Deep linking to specific games
6. **Notifications**: Alert when epoch ends or rewards available
