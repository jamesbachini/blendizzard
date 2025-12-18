/**
 * Wallet Bridge - Handles cross-window communication with Ohloss wallet
 *
 * Opens a popup window to the wallet app for signing transactions.
 * Uses postMessage API for secure cross-origin communication.
 */

import {
  type ConnectRequest,
  type ConnectResponse,
  type SignTransactionRequest,
  type SignTransactionResponse,
  type SignAuthEntryRequest,
  type SignAuthEntryResponse,
  type SubmitTransactionRequest,
  type SubmitTransactionResponse,
  type WalletUiErrorRequest,
  type WalletToGameMessage,
  createMessage,
  generateRequestId,
  isWalletMessage,
} from '@/types/messages'

// Configuration
const WALLET_URL = import.meta.env.VITE_OHLOSS_URL || 'http://localhost:5173'
const SIGNER_PATH = '/signer'
const POPUP_WIDTH = 420
const POPUP_HEIGHT = 600
// These flows can include passkey prompts, wallet creation, and faction selection.
// Keep timeouts generous to avoid spurious failures.
const CONNECTION_TIMEOUT = 600_000 // 10 minutes
const SIGN_TIMEOUT = 600_000 // 10 minutes

// Pending request tracker
interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

// WalletBridge singleton
class WalletBridge {
  private popup: Window | null = null
  private pendingRequests = new Map<string, PendingRequest<unknown>>()
  private messageListener: ((event: MessageEvent) => void) | null = null
  private walletOrigin: string

  // Popup readiness tracking (prevents postMessage races during initial load)
  private popupReady = false
  private popupReadyWaiters: Array<() => void> = []

  constructor() {
    this.walletOrigin = new URL(WALLET_URL).origin
    this.setupMessageListener()
  }

  private setupMessageListener() {
    this.messageListener = (event: MessageEvent) => {
      // Validate origin
      if (event.origin !== this.walletOrigin) {
        return
      }

      // Validate message structure
      if (!isWalletMessage(event.data)) {
        return
      }

      this.handleWalletMessage(event.data)
    }

    window.addEventListener('message', this.messageListener)
  }

  private handleWalletMessage(message: WalletToGameMessage) {
    // Track popup readiness so we can avoid postMessage races.
    if (message.type === 'WALLET_STATUS_UPDATE' && message.status === 'ready') {
      this.popupReady = true
      const waiters = this.popupReadyWaiters
      this.popupReadyWaiters = []
      for (const w of waiters) w()
      // Continue processing in case other logic also cares
    }

    // Handle connect response
    if (message.type === 'CONNECT_RESPONSE') {
      const pending = this.pendingRequests.get('connect')
      if (pending) {
        clearTimeout(pending.timeoutId)
        this.pendingRequests.delete('connect')
        pending.resolve(message as ConnectResponse)
      }
      return
    }

    // Handle responses with requestId
    const requestId = 'requestId' in message ? message.requestId : null
    if (requestId) {
      const pending = this.pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timeoutId)
        this.pendingRequests.delete(requestId)
        pending.resolve(message)
      }
    }
  }

  private handlePopupClosed() {
    // Clear popup reference immediately so new requests will open a new popup
    this.popup = null
    this.popupReady = false
    this.popupReadyWaiters = []

    // Reject remaining pending requests (those that didn't get a response)
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error('Wallet popup was closed'))
      this.pendingRequests.delete(id)
    }
  }

  private openPopup(path: string = ''): Window | null {
    // Check if popup is already open and focused
    if (this.popup && !this.popup.closed) {
      this.popup.focus()
      return this.popup
    }

    // New popup => not ready until the signer page tells us
    this.popupReady = false

    // Calculate popup position (centered)
    const left = Math.round((window.screen.width - POPUP_WIDTH) / 2)
    const top = Math.round((window.screen.height - POPUP_HEIGHT) / 2)

    // Safari may ignore width/height unless the window is treated as a "popup".
    // NOTE: Do NOT use `noopener`/`noreferrer` here because the signer relies on `window.opener`.
    const features = [
      `width=${POPUP_WIDTH}`,
      `height=${POPUP_HEIGHT}`,
      `left=${left}`,
      `top=${top}`,
      'popup=yes',
      'resizable=yes',
      'scrollbars=yes',
      'status=yes',
      'toolbar=no',
      'menubar=no',
      'location=no',
    ].join(',')

    const url = `${WALLET_URL}${SIGNER_PATH}${path}`
    this.popup = window.open(url, 'ohloss-wallet', features)

    if (this.popup) {
      // Monitor for popup close
      const checkClosed = setInterval(() => {
        if (this.popup?.closed) {
          clearInterval(checkClosed)
          this.handlePopupClosed()
        }
      }, 500)
    }

    return this.popup
  }

  private async waitForPopupReady(timeoutMs: number = 10_000): Promise<void> {
    if (this.popupReady) return

    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        // Don't hard-fail; some environments might not send readiness.
        // Resolve anyway so we can attempt to send.
        resolve()
      }, timeoutMs)

      this.popupReadyWaiters.push(() => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  private sendMessage(message: unknown) {
    if (!this.popup || this.popup.closed) {
      throw new Error('Wallet popup is not open')
    }
    this.popup.postMessage(message, this.walletOrigin)
  }

  private waitForResponse<T>(
    requestId: string,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Request timed out'))
      }, timeout)

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      })
    })
  }

  /**
   * Pre-open (or focus) the wallet popup.
   *
   * IMPORTANT: Call this synchronously from a user gesture (e.g. button click)
   * before any awaited work. Many browsers will block window.open() if it happens
   * after an async boundary.
   */
  preopen(path: string = ''): { success: true } | { error: string } {
    const popup = this.openPopup(path)
    if (!popup) {
      return { error: 'Failed to open wallet popup. Please allow popups.' }
    }
    return { success: true }
  }

  /**
   * Connect to the Ohloss wallet
   * Opens popup and waits for user to authenticate with passkey
   */
  async connect(): Promise<{ address: string } | { error: string }> {
    const popup = this.openPopup('?action=connect')
    if (!popup) {
      return { error: 'Failed to open wallet popup. Please allow popups.' }
    }

    // Wait for signer page to be ready (prevents dropped postMessage)
    await this.waitForPopupReady(10_000)

    const message = createMessage<ConnectRequest>('CONNECT_REQUEST', {
      appName: 'Number Guess',
      appIcon: window.location.origin + '/favicon.svg',
    })

    try {
      this.sendMessage(message)
      const response = await this.waitForResponse<ConnectResponse>(
        'connect',
        CONNECTION_TIMEOUT
      )

      if (response.success && response.address) {
        return { address: response.address }
      } else {
        return { error: response.error || 'Connection failed' }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Connection failed' }
    }
  }

  /**
   * Sign a transaction
   * @param transactionXdr - The transaction XDR to sign
   * @param description - Human-readable description for the user
   * @param submit - If true, wallet will also submit the transaction
   */
  async signTransaction(
    transactionXdr: string,
    description: string,
    submit: boolean = false
  ): Promise<{ signedXdr: string; txHash?: string } | { error: string }> {
    const popup = this.openPopup()
    if (!popup) {
      return { error: 'Failed to open wallet popup' }
    }

    const requestId = generateRequestId()
    const message = createMessage<SignTransactionRequest>('SIGN_TRANSACTION_REQUEST', {
      requestId,
      transactionXdr,
      description,
      submit,
    })

    // Wait for signer page to be ready (prevents dropped postMessage)
    await this.waitForPopupReady(10_000)

    try {
      this.sendMessage(message)
      const response = await this.waitForResponse<SignTransactionResponse>(
        requestId,
        SIGN_TIMEOUT
      )

      if (response.success && response.signedXdr) {
        return {
          signedXdr: response.signedXdr,
          txHash: response.txHash,
        }
      } else {
        return { error: response.error || 'Signing failed' }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Signing failed' }
    }
  }

  /**
   * Sign an auth entry (for multi-sig flows)
   * @param authEntryXdr - The auth entry XDR to sign
   * @param description - Human-readable description for the user
   */
  async signAuthEntry(
    authEntryXdr: string,
    description: string
  ): Promise<{ signedAuthEntryXdr: string } | { error: string }> {
    const popup = this.openPopup()
    if (!popup) {
      return { error: 'Failed to open wallet popup' }
    }

    const requestId = generateRequestId()
    const message = createMessage<SignAuthEntryRequest>('SIGN_AUTH_ENTRY_REQUEST', {
      requestId,
      authEntryXdr,
      description,
    })

    // Wait for signer page to be ready (prevents dropped postMessage)
    await this.waitForPopupReady(10_000)

    try {
      this.sendMessage(message)
      const response = await this.waitForResponse<SignAuthEntryResponse>(
        requestId,
        SIGN_TIMEOUT
      )

      if (response.success && response.signedAuthEntryXdr) {
        return { signedAuthEntryXdr: response.signedAuthEntryXdr }
      } else {
        return { error: response.error || 'Auth entry signing failed' }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Auth entry signing failed' }
    }
  }

  /**
   * Submit a signed transaction
   * @param transactionXdr - The signed transaction XDR
   */
  async submitTransaction(
    transactionXdr: string
  ): Promise<{ txHash: string } | { error: string }> {
    const popup = this.openPopup()
    if (!popup) {
      return { error: 'Failed to open wallet popup' }
    }

    const requestId = generateRequestId()
    const message = createMessage<SubmitTransactionRequest>('SUBMIT_TRANSACTION_REQUEST', {
      requestId,
      transactionXdr,
    })

    // Wait for signer page to be ready (prevents dropped postMessage)
    await this.waitForPopupReady(10_000)

    try {
      this.sendMessage(message)
      const response = await this.waitForResponse<SubmitTransactionResponse>(
        requestId,
        SIGN_TIMEOUT
      )

      if (response.success && response.txHash) {
        return { txHash: response.txHash }
      } else {
        return { error: response.error || 'Submission failed' }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Submission failed' }
    }
  }

  /**
   * Notify the signer popup about an error that happened in the game app
   * after the popup was pre-opened but before a signing request could be sent
   * (e.g. transaction simulation/build failure).
   */
  notifyUiError(error: string) {
    try {
      if (!this.popup || this.popup.closed) return
      this.sendMessage(
        createMessage<WalletUiErrorRequest>('WALLET_UI_ERROR', {
          error,
        })
      )
    } catch {
      // best-effort; ignore
    }
  }

  /**
   * Close the popup
   */
  closePopup() {
    if (this.popup && !this.popup.closed) {
      this.popup.close()
    }
    this.popup = null
  }

  /**
   * Check if popup is open
   */
  isPopupOpen(): boolean {
    return this.popup !== null && !this.popup.closed
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener)
    }
    this.closePopup()
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId)
    }
    this.pendingRequests.clear()
  }
}

// Export singleton instance
export const walletBridge = new WalletBridge()
