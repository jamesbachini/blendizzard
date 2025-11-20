import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
} from '@creit.tech/stellar-wallets-kit';
import type { ISupportedWallet } from '@creit.tech/stellar-wallets-kit';
import { NETWORK, NETWORK_PASSPHRASE } from '@/utils/constants';

export interface WalletDetails {
  address: string;
  walletId: string;
  network: string;
  networkPassphrase: string;
}

/**
 * Wallet service using Stellar Wallets Kit
 * Supports multiple wallets (Freighter, xBull, Albedo, etc.)
 */
export class WalletService {
  private kit: StellarWalletsKit | null = null;
  private selectedWalletId: string | null = null;

  /**
   * Initialize the Stellar Wallets Kit
   */
  private async initKit() {
    if (this.kit) return this.kit;

    // Convert NETWORK to WalletNetwork enum
    const network = NETWORK.toLowerCase() === 'testnet' ? WalletNetwork.TESTNET : WalletNetwork.PUBLIC;

    this.kit = new StellarWalletsKit({
      network,
      selectedWalletId: this.selectedWalletId || undefined,
      modules: allowAllModules(),
    });

    return this.kit;
  }

  /**
   * Get the kit instance
   */
  async getKit(): Promise<StellarWalletsKit> {
    if (!this.kit) {
      await this.initKit();
    }
    return this.kit!;
  }

  /**
   * Open the wallet selection modal
   * Returns the selected wallet details
   */
  async openModal(): Promise<WalletDetails> {
    const kit = await this.getKit();

    return new Promise((resolve, reject) => {
      kit.openModal({
        onWalletSelected: async (option: ISupportedWallet) => {
          try {
            await kit.setWallet(option.id);
            this.selectedWalletId = option.id;

            const { address } = await kit.getAddress();

            resolve({
              address,
              walletId: option.id,
              network: NETWORK,
              networkPassphrase: NETWORK_PASSPHRASE,
            });
          } catch (error) {
            reject(error);
          }
        },
        onClosed: (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            reject(new Error('Wallet selection cancelled'));
          }
        },
        modalTitle: 'Connect Your Wallet',
        notAvailableText: 'No wallets available. Please install a Stellar wallet.',
      });
    });
  }

  /**
   * Connect with a specific wallet ID (if already known from session)
   * Used for reconnecting on page reload
   */
  async connectWithWalletId(walletId: string): Promise<string> {
    const kit = await this.getKit();

    try {
      await kit.setWallet(walletId);
      this.selectedWalletId = walletId;

      const { address } = await kit.getAddress();
      return address;
    } catch (error) {
      console.error('Error reconnecting wallet:', error);
      throw new Error('Failed to reconnect wallet. Please connect again.');
    }
  }

  /**
   * Sign a transaction XDR
   * Returns { signedTxXdr: string, signerAddress?: string, error?: WalletError }
   */
  async signTransaction(xdr: string, opts?: { address?: string }) {
    if (!this.kit) {
      throw new Error('Wallet not initialized. Please connect first.');
    }

    try {
      // Return the full response object from the kit
      // The SDK expects at minimum { signedTxXdr: string }
      return await this.kit.signTransaction(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: opts?.address,
      });
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw error;
    }
  }

  /**
   * Sign an auth entry (for Soroban contracts)
   * Returns { signedAuthEntry: string, signerAddress?: string } to match the contract.ClientOptions interface
   *
   * NOTE: stellar-wallets-kit already converts Freighter's Buffer response to base64 string
   */
  async signAuthEntry(authEntry: string, opts?: { address?: string }) {
    if (!this.kit) {
      throw new Error('Wallet not initialized. Please connect first.');
    }

    try {
      const result = await this.kit.signAuthEntry(authEntry, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: opts?.address,
      });

      // stellar-wallets-kit already handles the conversion from Buffer to base64
      // Just return the result as-is
      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress,
      };
    } catch (error) {
      console.error('Error signing auth entry:', error);
      // Some wallets don't support signAuthEntry
      if (error instanceof Error) {
        if (error.message.includes('not supported') || error.message.includes('not implemented')) {
          throw new Error(
            'This wallet does not support signing auth entries. ' +
            'Please use dev mode or a compatible wallet.'
          );
        }
      }
      throw error;
    }
  }

  /**
   * Get the current network
   */
  getNetwork(): { network: string; networkPassphrase: string } {
    return {
      network: NETWORK,
      networkPassphrase: NETWORK_PASSPHRASE,
    };
  }

  /**
   * Disconnect the wallet
   */
  async disconnect(): Promise<void> {
    if (this.kit) {
      // Some wallet modules support disconnect
      try {
        await this.kit.disconnect?.();
      } catch (error) {
        console.warn('Wallet disconnect not supported or failed:', error);
      }
    }
    this.kit = null;
    this.selectedWalletId = null;
  }

  /**
   * Get the currently selected wallet ID
   */
  getSelectedWalletId(): string | null {
    return this.selectedWalletId;
  }

  /**
   * Get the install link for Freighter wallet
   */
  getInstallLink(): string {
    return 'https://www.freighter.app/';
  }
}

// Export singleton instance
export const walletService = new WalletService();
