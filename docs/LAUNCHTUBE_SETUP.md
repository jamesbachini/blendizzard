# Launchtube Integration Setup

This document explains how the Launchtube transaction submission service has been integrated into the Blendizzard frontend.

## Overview

Transactions are now submitted via Launchtube instead of directly to the RPC network. This provides:
- Transaction submission protection via Cloudflare Turnstile
- Rate limiting and anti-bot protection
- Sponsored transaction fees (when configured)

## Architecture

```
User Action → Build TX → Sign TX → Get Turnstile Token → Submit to Launchtube → Network
```

### Flow Details

1. **Transaction Building**: Contract methods build transactions as usual
2. **Signing**: Transactions are signed using the wallet (via SWKv2)
3. **Turnstile Token**: Automatically obtained from Cloudflare widget
4. **Launchtube Submission**: Signed XDR + Turnstile token sent to Launchtube API
5. **Network Confirmation**: Poll RPC until transaction is confirmed

## Environment Variables

Add these to your `.env` file (copy from `.env.example`):

```bash
# Launchtube Configuration
VITE_LAUNCHTUBE_URL=http://launchtube.xyz
VITE_LAUNCHTUBE_JWT=<your-launchtube-jwt-token>

# Cloudflare Turnstile
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA  # Test key for dev
```

### Getting Launchtube Credentials

1. **Local Development**:
   - URL: `http://launchtube.xyz`
   - JWT: Request from Stellar Discord #launchtube channel

2. **Production**:
   - URL: `https://kale-worker.sdf-ecosystem.workers.dev` (or your custom endpoint)
   - JWT: Production token from Launchtube team
   - Site Key: Real Cloudflare Turnstile site key from dashboard

## Files Created

### Core Services
- `src/services/launchtubeService.ts` - Handles Launchtube API communication
- `src/store/turnstileSlice.ts` - Zustand store for Turnstile token
- `src/utils/transactionHelper.ts` - Helper to replace `signAndSend()`

### Configuration
- `src/utils/constants.ts` - Added Launchtube/Turnstile constants
- `index.html` - Added Turnstile widget script and container
- `src/main.tsx` - Initialize Turnstile widget on page load

## Files Modified

All service files now use `signAndSendViaLaunchtube()` instead of `signAndSend()`:

- ✅ `src/services/blendizzardService.ts` (4 instances updated)
- ✅ `src/services/feeVaultService.ts` (2 instances updated)
- ✅ `src/services/numberGuessService.ts` (3 instances updated)

## How It Works

### Before (Direct RPC)
```typescript
const tx = await client.select_faction({ player, faction });
const { result } = await tx.signAndSend();  // Direct to RPC
```

### After (via Launchtube)
```typescript
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';

const tx = await client.select_faction({ player, faction });
const { result } = await signAndSendViaLaunchtube(tx);  // Via Launchtube
```

### What Happens Inside `signAndSendViaLaunchtube`

1. Signs the transaction with wallet
2. Gets Turnstile token from store
3. Submits to Launchtube with headers:
   ```
   Authorization: Bearer {JWT}
   X-Turnstile-Response: {token}
   X-Client-Name: blendizzard
   X-Client-Version: 0.0.1
   ```
4. Polls network for confirmation
5. Returns result in same format as `signAndSend()`

## Turnstile Widget

The Cloudflare Turnstile widget is invisible and runs in "interaction-only" mode:
- Automatically renders on page load
- Generates tokens when user interacts with the page
- Tokens are stored in Zustand and passed to Launchtube

## Testing

### Local Development

1. Copy `.env.example` to `.env`
2. Add your Launchtube JWT (get from Discord)
3. Use test Turnstile key: `1x00000000000000000000AA`
4. Run `npm run dev`
5. Transactions will go through Launchtube

### Without Launchtube (Fallback)

If `VITE_LAUNCHTUBE_JWT` is not set, the service will throw an error. There's no automatic fallback to direct RPC to ensure you're aware when Launchtube is not configured.

## Production Deployment

1. Get production Launchtube JWT token
2. Get production Turnstile site key from Cloudflare dashboard
3. Update environment variables:
   ```bash
   VITE_LAUNCHTUBE_URL=https://kale-worker.sdf-ecosystem.workers.dev
   VITE_LAUNCHTUBE_JWT=<production-jwt>
   VITE_TURNSTILE_SITE_KEY=<production-site-key>
   ```
4. Build and deploy: `npm run build`

## Troubleshooting

### "Launchtube JWT not configured" Error
- Check that `VITE_LAUNCHTUBE_JWT` is set in `.env`
- Restart dev server after adding env vars

### Transactions Not Submitting
- Check browser console for Turnstile errors
- Verify Launchtube URL is correct
- Check JWT token is valid
- Test with curl to verify Launchtube endpoint

### Turnstile Not Loading
- Check that Turnstile script loaded: `https://challenges.cloudflare.com/turnstile/v0/api.js`
- Verify `<div class="cf-turnstile"></div>` exists in page
- Check browser console for initialization errors

## API Reference

### LaunchtubeService

```typescript
import { launchtubeService } from '@/services/launchtubeService';

// Submit transaction
const { hash, status } = await launchtubeService.submitTransaction(
  signedXdr,
  turnstileToken
);

// Submit and wait for confirmation
const result = await launchtubeService.submitAndWait(
  signedXdr,
  turnstileToken,
  rpcClient,
  30 // timeout in seconds
);

// Check if configured
if (launchtubeService.isConfigured()) {
  // Use Launchtube
}
```

### Turnstile Store

```typescript
import { useTurnstileStore, turnstileCallback } from '@/store/turnstileSlice';

// In component
const token = useTurnstileStore(state => state.token);

// Callback for Turnstile widget (already wired up)
window.turnstile.render('.cf-turnstile', {
  callback: turnstileCallback,
  // ...
});
```

## Resources

- [Launchtube Documentation](https://launchtube.xyz)
- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- [Stellar Discord - #launchtube](https://discord.gg/stellardev)
- [KALE-site Reference Implementation](https://github.com/kalepail/KALE-site)
