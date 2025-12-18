/**
 * Cross-window message types for Game <-> Wallet communication
 * Uses postMessage API with structured message format
 */

// Base message type with discriminator
export interface BaseMessage {
  type: string
  origin: string
  timestamp: number
}

// ============ Game -> Wallet Messages ============

export interface ConnectRequest extends BaseMessage {
  type: 'CONNECT_REQUEST'
  appName: string
  appIcon?: string
}

export interface DisconnectRequest extends BaseMessage {
  type: 'DISCONNECT_REQUEST'
}

export interface SignTransactionRequest extends BaseMessage {
  type: 'SIGN_TRANSACTION_REQUEST'
  requestId: string
  transactionXdr: string
  description: string
  submit?: boolean // If true, wallet should submit after signing
}

export interface SignAuthEntryRequest extends BaseMessage {
  type: 'SIGN_AUTH_ENTRY_REQUEST'
  requestId: string
  authEntryXdr: string
  description: string
}

export interface SubmitTransactionRequest extends BaseMessage {
  type: 'SUBMIT_TRANSACTION_REQUEST'
  requestId: string
  transactionXdr: string // Signed XDR
}

// Wallet UI notification (used when the game pre-opens the popup but fails before
// it can send a signing request, e.g. transaction simulation/build errors).
export interface WalletUiErrorRequest extends BaseMessage {
  type: 'WALLET_UI_ERROR'
  error: string
}

// Union type for all Game -> Wallet messages
export type GameToWalletMessage =
  | ConnectRequest
  | DisconnectRequest
  | SignTransactionRequest
  | SignAuthEntryRequest
  | SubmitTransactionRequest
  | WalletUiErrorRequest

// ============ Wallet -> Game Messages ============

export interface ConnectResponse extends BaseMessage {
  type: 'CONNECT_RESPONSE'
  success: boolean
  address?: string // Smart wallet C-address
  error?: string
}

export interface DisconnectResponse extends BaseMessage {
  type: 'DISCONNECT_RESPONSE'
  success: boolean
}

export interface SignTransactionResponse extends BaseMessage {
  type: 'SIGN_TRANSACTION_RESPONSE'
  requestId: string
  success: boolean
  signedXdr?: string
  txHash?: string // If submitted
  error?: string
}

export interface SignAuthEntryResponse extends BaseMessage {
  type: 'SIGN_AUTH_ENTRY_RESPONSE'
  requestId: string
  success: boolean
  signedAuthEntryXdr?: string
  error?: string
}

export interface SubmitTransactionResponse extends BaseMessage {
  type: 'SUBMIT_TRANSACTION_RESPONSE'
  requestId: string
  success: boolean
  txHash?: string
  error?: string
}

// Wallet can push status updates
export interface WalletStatusUpdate extends BaseMessage {
  type: 'WALLET_STATUS_UPDATE'
  status: 'ready' | 'signing' | 'submitting' | 'closed'
}

// Union type for all Wallet -> Game messages
export type WalletToGameMessage =
  | ConnectResponse
  | DisconnectResponse
  | SignTransactionResponse
  | SignAuthEntryResponse
  | SubmitTransactionResponse
  | WalletStatusUpdate

// ============ Helper Types ============

// All possible message types
export type CrossWindowMessage = GameToWalletMessage | WalletToGameMessage

// Message type discriminators
export type GameToWalletMessageType = GameToWalletMessage['type']
export type WalletToGameMessageType = WalletToGameMessage['type']

// Request ID generator
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// Create a message with common fields
export function createMessage<T extends CrossWindowMessage>(
  type: T['type'],
  data: Omit<T, 'type' | 'origin' | 'timestamp'>
): T {
  return {
    type,
    origin: window.location.origin,
    timestamp: Date.now(),
    ...data,
  } as T
}

// Type guard for wallet messages
export function isWalletMessage(msg: unknown): msg is WalletToGameMessage {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as { type?: string }
  return [
    'CONNECT_RESPONSE',
    'DISCONNECT_RESPONSE',
    'SIGN_TRANSACTION_RESPONSE',
    'SIGN_AUTH_ENTRY_RESPONSE',
    'SUBMIT_TRANSACTION_RESPONSE',
    'WALLET_STATUS_UPDATE',
  ].includes(m.type || '')
}

// Type guard for game messages
export function isGameMessage(msg: unknown): msg is GameToWalletMessage {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as { type?: string }
  return [
    'CONNECT_REQUEST',
    'DISCONNECT_REQUEST',
    'SIGN_TRANSACTION_REQUEST',
    'SIGN_AUTH_ENTRY_REQUEST',
    'SUBMIT_TRANSACTION_REQUEST',
    'WALLET_UI_ERROR',
  ].includes(m.type || '')
}
