import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { turnstileCallback } from './store/turnstileSlice'
import { TURNSTILE_SITE_KEY } from './utils/constants'

// Polyfills for Stellar Wallets Kit (browser compatibility)
import { Buffer } from 'buffer'
window.Buffer = Buffer
window.global = window

// Initialize Cloudflare Turnstile widget
declare global {
  interface Window {
    turnstile: {
      ready: (callback: () => void) => void;
      render: (element: string, options: {
        appearance?: 'always' | 'execute' | 'interaction-only';
        sitekey: string;
        'response-field'?: boolean;
        'feedback-enabled'?: boolean;
        callback?: (token: string) => void;
        'error-callback'?: (error: unknown) => void;
      }) => void;
    };
  }
}

// Initialize Turnstile when the API is ready
if (typeof window !== 'undefined' && window.turnstile) {
  window.turnstile.ready(() => {
    window.turnstile.render('.cf-turnstile', {
      appearance: 'interaction-only',
      sitekey: TURNSTILE_SITE_KEY,
      'response-field': false,
      'feedback-enabled': false,
      callback: (token: string) => turnstileCallback(token),
      'error-callback': (error: unknown) => console.error('Turnstile error:', error),
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
