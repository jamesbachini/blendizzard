import { useCallback, useRef } from 'react';
import { useWalletStore } from '@/store/walletSlice';
import { StellarWalletsKit, WalletNetwork, allowAllModules } from '@creit.tech/stellar-wallets-kit';
import type { ISupportedWallet } from '@creit.tech/stellar-wallets-kit';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import { NETWORK, NETWORK_PASSPHRASE } from '@/utils/constants';
import type { ContractSigner } from '@/types/signer';

export function useWallet() {
  const {
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    setWallet,
    setConnecting,
    setNetwork,
    setError,
    disconnect: storeDisconnect,
  } = useWalletStore();

  // v1 uses instance-based API, store the kit instance
  const kitRef = useRef<StellarWalletsKit | null>(null);

  /**
   * Get or create StellarWalletsKit instance
   */
  const getKit = useCallback(() => {
    if (!kitRef.current) {
      const walletNetwork = NETWORK.toLowerCase() === 'testnet'
        ? WalletNetwork.TESTNET
        : WalletNetwork.PUBLIC;

      kitRef.current = new StellarWalletsKit({
        network: walletNetwork,
        modules: allowAllModules(),
      });
    }
    return kitRef.current;
  }, []);

  /**
   * Connect to a wallet using the modal
   */
  const connect = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        setConnecting(true);
        setError(null);

        const kit = getKit();

        // v1 API: openModal with callbacks
        kit.openModal({
          onWalletSelected: async (wallet: ISupportedWallet) => {
            try {
              kit.setWallet(wallet.id);
              const { address } = await kit.getAddress();

              // Update store with wallet details
              setWallet(address, wallet.id, 'wallet');
              setNetwork(NETWORK, NETWORK_PASSPHRASE);
              setConnecting(false);
              resolve();
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Failed to get address';
              setError(errorMessage);
              setConnecting(false);
              reject(err);
            }
          },
          onClosed: (err) => {
            if (err) {
              const errorMessage = err instanceof Error ? err.message : 'Modal closed';
              setError(errorMessage);
              reject(err);
            } else {
              // User closed modal without selecting
              reject(new Error('Connection cancelled'));
            }
            setConnecting(false);
          },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to open modal';
        setError(errorMessage);
        setConnecting(false);
        reject(err);
      }
    });
  }, [setWallet, setConnecting, setNetwork, setError, getKit]);

  /**
   * Connect as a dev player (for testing)
   */
  const connectDev = useCallback(
    async (playerNumber: 1 | 2) => {
      try {
        setConnecting(true);
        setError(null);

        devWalletService.initPlayer(playerNumber);
        const address = devWalletService.getPublicKey();

        // Update store with dev wallet
        setWallet(address, `dev-player${playerNumber}`, 'dev');
        setNetwork(NETWORK, NETWORK_PASSPHRASE);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect dev wallet';
        setError(errorMessage);
        console.error('Dev wallet connection error:', err);
        throw err;
      }
    },
    [setWallet, setConnecting, setNetwork, setError]
  );

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    if (walletType === 'wallet' && kitRef.current) {
      // v1 doesn't have a disconnect method - just clear the reference
      kitRef.current = null;
    } else if (walletType === 'dev') {
      devWalletService.disconnect();
    }
    storeDisconnect();
  }, [walletType, storeDisconnect]);

  /**
   * Get a signer for contract interactions
   * Returns functions that the Stellar SDK TS bindings can use for signing
   */
  const getContractSigner = useCallback((): ContractSigner => {
    if (!isConnected || !publicKey || !walletType) {
      throw new Error('Wallet not connected');
    }

    if (walletType === 'dev') {
      // Dev wallet uses the dev wallet service's signer
      return devWalletService.getSigner();
    } else {
      // Wallet signer calls v1 StellarWalletsKit instance methods
      const kit = getKit();
      return {
        signTransaction: async (xdr: string, opts?: {
          networkPassphrase?: string;
          address?: string;
          submit?: boolean;
          submitUrl?: string;
        }) => {
          const signingAddress = opts?.address || publicKey;
          console.log('signingAddress', signingAddress);
          return await kit.signTransaction(xdr, {
            networkPassphrase: NETWORK_PASSPHRASE,
            address: signingAddress,
          });
        },
        signAuthEntry: async (authEntry: string, opts?: {
          networkPassphrase?: string;
          address?: string;
        }) => {
          const signingAddress = opts?.address || publicKey;
          console.log('signingAddress', signingAddress);
          const result = await kit.signAuthEntry(authEntry, {
            networkPassphrase: NETWORK_PASSPHRASE,
            address: signingAddress,
          });
          return {
            signedAuthEntry: result.signedAuthEntry,
            signerAddress: result.signerAddress,
          };
        },
      };
    }
  }, [isConnected, publicKey, walletType, getKit]);

  /**
   * Check if dev mode is available
   */
  const isDevModeAvailable = useCallback(() => {
    return DevWalletService.isDevModeAvailable();
  }, []);

  /**
   * Check if a specific dev player is available
   */
  const isDevPlayerAvailable = useCallback((playerNumber: 1 | 2) => {
    return DevWalletService.isPlayerAvailable(playerNumber);
  }, []);

  /**
   * Get the install link for wallet extension
   */
  const getInstallLink = useCallback(() => {
    return 'https://www.freighter.app/';
  }, []);

  return {
    // State
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,

    // Actions
    connect,
    connectDev,
    disconnect,
    getContractSigner,
    isDevModeAvailable,
    isDevPlayerAvailable,
    getInstallLink,
  };
}
