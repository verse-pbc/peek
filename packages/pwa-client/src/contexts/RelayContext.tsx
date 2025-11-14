import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { RelayManager } from "@/services/relay-manager";
import { GroupManager } from "@/services/group-manager";
import { IdentityMigrationService } from "@/services/identity-migration";
import {
  finalizeEvent,
  type EventTemplate,
  type VerifiedEvent,
} from "nostr-tools";
import { hexToBytes } from "@/lib/hex";
import { useNostrLogin } from "@/lib/nostr-identity";
import { useTranslation } from 'react-i18next';

interface RelayContextType {
  relayManager: RelayManager | null;
  groupManager: GroupManager | null;
  migrationService: IdentityMigrationService | null;
  connected: boolean;
  waitingForBunkerApproval: boolean;
  retryInfo: { attempt: number; isRetrying: boolean; maxAttempts: number };
  connect: () => Promise<void>;
  disconnect: () => void;
  manualRetry: () => void;
  waitForConnection: () => Promise<void>;
}

const RelayContext = createContext<RelayContextType | null>(null);

export const useRelayManager = () => {
  const context = useContext(RelayContext);
  if (!context) {
    throw new Error("useRelayManager must be used within RelayProvider");
  }
  return context;
};

interface RelayProviderProps {
  children: React.ReactNode;
}

export const RelayProvider: React.FC<RelayProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const [relayManager, setRelayManager] = useState<RelayManager | null>(null);
  const [groupManager, setGroupManager] = useState<GroupManager | null>(null);
  const [migrationService, setMigrationService] =
    useState<IdentityMigrationService | null>(null);
  const [connected, setConnected] = useState(false);
  const [waitingForBunkerApproval, setWaitingForBunkerApproval] = useState(false);
  const [retryInfo, setRetryInfo] = useState({ attempt: 0, isRetrying: false, maxAttempts: 10 });
  const managerRef = useRef<RelayManager | null>(null);
  const groupManagerRef = useRef<GroupManager | null>(null);
  const migrationServiceRef = useRef<IdentityMigrationService | null>(null);
  const connectionPromiseRef = useRef<Promise<void> | null>(null);
  const connectionResolveRef = useRef<(() => void) | null>(null);
  const { identity } = useNostrLogin();
  const identityRef = useRef(identity);
  const previousPubkeyRef = useRef<string | null>(null);
  const bunkerSignerRef = useRef<{ signEvent: (event: EventTemplate) => Promise<VerifiedEvent>; close: () => void } | null>(null);
  const bunkerPoolRef = useRef<{ close: (relays: string[]) => void } | null>(null);

  // Keep identity ref up to date
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  // Poll retry status while not connected
  useEffect(() => {
    if (!connected && managerRef.current) {
      const interval = setInterval(() => {
        const info = managerRef.current!.getRetryInfo();
        setRetryInfo(info);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      // Reset retry info when connected
      setRetryInfo({ attempt: 0, isRetrying: false, maxAttempts: 10 });
    }
  }, [connected]);

  // Force reconnection when tab becomes visible (handles sleep/wake)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && managerRef.current && !managerRef.current.isConnected()) {
        console.log('[RelayContext] Tab visible and disconnected, reconnecting...');
        managerRef.current.connect();
      }
    };

    const handleOnline = () => {
      if (managerRef.current && !managerRef.current.isConnected()) {
        console.log('[RelayContext] Network restored, reconnecting');
        managerRef.current.connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []); // Empty deps = listener active for app lifetime

  // Auto-reconnect when identity changes (migration, login, logout)
  useEffect(() => {
    const currentPubkey = identity?.publicKey || null;
    const previousPubkey = previousPubkeyRef.current;

    // Detect identity change (not initial load)
    if (previousPubkey && currentPubkey && currentPubkey !== previousPubkey) {
      console.log('[RelayContext] Identity changed, forcing reconnect:', {
        from: previousPubkey.slice(0, 8) + '...',
        to: currentPubkey.slice(0, 8) + '...'
      });

      // Properly dispose old manager (closes pool connections)
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
      if (groupManagerRef.current) {
        groupManagerRef.current.dispose();
        groupManagerRef.current = null;
      }
      if (migrationServiceRef.current) {
        migrationServiceRef.current = null;
      }

      // Close bunker signer if switching from bunker identity
      if (bunkerSignerRef.current) {
        console.log('[RelayContext] Identity changed - closing old bunker signer');
        bunkerSignerRef.current.close();
        bunkerSignerRef.current = null;
      }

      // Close bunker pool if active
      if (bunkerPoolRef.current) {
        console.log('[RelayContext] Identity changed - closing bunker pool');
        bunkerPoolRef.current.close([]);
        bunkerPoolRef.current = null;
      }

      // Clear state - triggers re-initialization in main effect
      setRelayManager(null);
      setGroupManager(null);
      setMigrationService(null);
      setConnected(false);
    }

    previousPubkeyRef.current = currentPubkey;
  }, [identity?.publicKey]); // Only react to identity changes, not manager changes

  useEffect(() => {
    // Skip if already initialized (prevents HMR from creating duplicates)
    if (managerRef.current) {
      console.log('[RelayContext] Skipping init - manager already exists');
      return;
    }

    // Skip if identity is still loading (prevent race condition)
    // Identity loading now waits for service worker, so we must wait too
    if (!identity && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      console.log('[RelayContext] Waiting for identity to load...');
      return;
    }

    const initializeRelay = async () => {
      // Initialize relay manager
      const relayUrl = import.meta.env.VITE_RELAY_URL || "ws://localhost:8080";
      const manager = new RelayManager({
        url: relayUrl,
        autoConnect: false,
      });

      let secretKeyBytes: Uint8Array | undefined;
      let publicKeyHex: string | undefined;
      let usingExtension = false;

      const STORAGE_KEY = "peek_nostr_identity";

      // Check stored identity first (works for both extension and key-based auth)
      const storedIdentity = localStorage.getItem(STORAGE_KEY);
      const personalIdentity = storedIdentity ? JSON.parse(storedIdentity) : null;

      // Check if stored identity is NIP-07 extension-based
      if (
        personalIdentity?.type === "extension" &&
        personalIdentity?.publicKey &&
        typeof window !== "undefined" &&
        window.nostr
      ) {
        // User has previously logged in with extension and extension is still available
        usingExtension = true;
        publicKeyHex = personalIdentity.publicKey;
        console.log("[RelayContext] Using stored NIP-07 extension identity:", personalIdentity.publicKey.slice(0, 8) + "...");
      }

      // If not using extension, check stored identity for key-based auth
      if (!usingExtension && personalIdentity) {

        if (personalIdentity || identity) {
          // Use stored identity (unified single source)
          const authIdentity = personalIdentity || identity;

          // Handle different identity types using discriminated union
          switch (authIdentity.type) {
            case 'local': {
              // Local identity with hex secret key (always auto-generated/anonymous)
              console.log('[RelayContext] Using anonymous local identity for auth:', authIdentity.publicKey.slice(0, 8) + '...');
              secretKeyBytes = hexToBytes(authIdentity.secretKey);
              publicKeyHex = authIdentity.publicKey;
              break;
            }

            case 'extension': {
              // Extension identity but extension check failed - use public key only
              console.log("[RelayContext] NIP-07 identity detected, using public key without secret key");
              publicKeyHex = authIdentity.publicKey;
              // secretKeyBytes remains undefined - extension will handle signing
              break;
            }

            case 'bunker': {
              // Bunker identity - create BunkerSigner for signing
              console.log("[RelayContext] Bunker identity detected, creating BunkerSigner...");
              publicKeyHex = authIdentity.publicKey;

              try {
                // Import NIP-46 dependencies
                const { BunkerSigner } = await import('nostr-tools/nip46');
                const { SimplePool } = await import('nostr-tools/pool');

                // Construct BunkerPointer from stored identity data (per NIP-46 spec)
                console.log("[RelayContext] Reconstructing BunkerPointer for reconnection");
                const bunkerInfo = {
                  pubkey: authIdentity.bunkerPubkey, // Remote signer's pubkey
                  relays: authIdentity.relays, // Relay URLs from initial connection
                  secret: authIdentity.secret // Connection secret (optional)
                };
                console.log("[RelayContext] Bunker pubkey:", bunkerInfo.pubkey.slice(0, 16) + '...');
                console.log("[RelayContext] Bunker relays:", bunkerInfo.relays);

                // Create SimplePool for bunker
                const bunkerPool = new SimplePool();
                bunkerPoolRef.current = bunkerPool;

                // Create BunkerSigner using fromBunker() factory
                // NO connect() call - already authorized from initial login
                const bunkerSigner = BunkerSigner.fromBunker(
                  hexToBytes(authIdentity.clientSecretKey),
                  bunkerInfo!,
                  {
                    pool: bunkerPool,
                    onauth: (authUrl: string) => {
                      console.log('[RelayContext] 🔐 Additional authorization required');
                      console.log('[RelayContext] Opening auth popup');

                      // Set waiting state ONLY when popup is actually needed
                      setWaitingForBunkerApproval(true);

                      // Try to open popup
                      const popup = window.open(authUrl, 'nsec-auth', 'width=600,height=700,popup=yes');

                      // Detect if popup was blocked
                      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                        console.warn('[RelayContext] ⚠️ Popup blocked by browser!');
                        console.log('[RelayContext] User must manually approve at:', authUrl);

                        // Show user-friendly message
                        if (confirm(t('identity_modal.key_manager.popup_blocked_message'))) {
                          window.location.href = authUrl;
                        }
                      } else {
                        console.log('[RelayContext] ✅ Auth popup opened successfully');

                        // Show OS notification to guide user
                        if ('Notification' in window && Notification.permission === 'granted') {
                          new Notification(t('identity_modal.key_manager.notification_approval_title'), {
                            body: t('identity_modal.key_manager.notification_approval_body'),
                            icon: '/pwa-192x192.png'
                          });
                        }
                      }
                    }
                  }
                );

                bunkerSignerRef.current = bunkerSigner;
                console.log("[RelayContext] ✅ BunkerSigner created and ready for signing");
              } catch (bunkerError) {
                console.error("[RelayContext] Failed to create BunkerSigner:", bunkerError);
                throw bunkerError;
              }

              // secretKeyBytes remains undefined - bunker will handle signing
              break;
            }

            default: {
              console.error('[RelayContext] Unknown identity type');
              break;
            }
          }
        }
      }

      if (!publicKeyHex) {
        console.error("[RelayContext] Failed to initialize identity");
        return;
      }

      // Set up relay manager with auth
      manager.setUserPubkey(publicKeyHex);

      // Check if we should use NIP-07 (either actively detected or stored identity is NIP-07)
      const isNIP07Identity = personalIdentity?.type === "extension";
      const shouldUseExtension = usingExtension || isNIP07Identity;
      const isBunkerIdentity = personalIdentity?.type === "bunker";

      if (isBunkerIdentity && bunkerSignerRef.current) {
        // Use bunker for signing
        console.log("[RelayContext] Setting up bunker signing handlers");

        manager.setAuthHandler(async (authEvent: EventTemplate) => {
          console.log(
            "[RelayContext] Signing NIP-42 auth event with bunker for pubkey:",
            publicKeyHex.slice(0, 8) + "...",
          );
          if (!bunkerSignerRef.current) {
            throw new Error("BunkerSigner not available");
          }

          console.log("[RelayContext] Calling bunkerSigner.signEvent...");

          try {
            const signedEvent = await bunkerSignerRef.current.signEvent(authEvent);
            console.log("[RelayContext] ✅ Bunker signed NIP-42 auth successfully");

            // Clear waiting state (in case it was set by onauth callback)
            setWaitingForBunkerApproval(false);

            // If relay timed out while waiting for approval, retry connection
            if (managerRef.current && !managerRef.current.isConnected()) {
              console.log("[RelayContext] Relay disconnected during auth - retrying connection...");
              setTimeout(() => {
                if (managerRef.current) {
                  managerRef.current.connect().catch((err) => {
                    console.error("[RelayContext] Retry connection failed:", err);
                  });
                }
              }, 100);
            }

            return signedEvent as VerifiedEvent;
          } catch (authError) {
            console.error("[RelayContext] ❌ Bunker signing failed:", authError);
            setWaitingForBunkerApproval(false);
            throw authError;
          }
        });

        // Set event signer for bunker
        manager.setEventSigner(async (event: EventTemplate) => {
          console.log("[RelayContext] Signing event with bunker, kind:", event.kind);
          if (!bunkerSignerRef.current) {
            throw new Error("BunkerSigner not available");
          }

          console.log("[RelayContext] Calling bunkerSigner.signEvent...");
          try {
            const signedEvent = await bunkerSignerRef.current.signEvent(event);
            console.log("[RelayContext] ✅ Bunker signed event successfully");
            return signedEvent as VerifiedEvent;
          } catch (signError) {
            console.error("[RelayContext] ❌ Bunker signing failed:", signError);
            throw signError;
          }
        });
      } else if (shouldUseExtension) {
        // Use NIP-07 extension for signing
        manager.setAuthHandler(async (authEvent: EventTemplate) => {
          console.log(
            "[RelayContext] Signing auth event with NIP-07 extension for pubkey:",
            publicKeyHex.slice(0, 8) + "...",
          );
          if (!window.nostr) {
            throw new Error("Browser extension not available");
          }
          const signedEvent = await window.nostr.signEvent(authEvent);
          return signedEvent as VerifiedEvent;
        });

        // Set event signer for NIP-07
        manager.setEventSigner(async (event: EventTemplate) => {
          console.log("[RelayContext] Signing event with NIP-07 extension");
          if (!window.nostr) {
            throw new Error("Browser extension not available");
          }
          const signedEvent = await window.nostr.signEvent(event);
          return signedEvent as VerifiedEvent;
        });
      } else {
        // Use local key for signing
        manager.setAuthHandler(async (authEvent: EventTemplate) => {
          console.log(
            "[RelayContext] Signing auth event for NIP-42 with pubkey:",
            publicKeyHex.slice(0, 8) + "...",
          );
          const currentIdentity = identityRef.current;

          // Get the current secret key based on identity type
          let currentSecretKey: Uint8Array;
          if (currentIdentity?.type === 'local') {
            currentSecretKey = hexToBytes(currentIdentity.secretKey);
          } else {
            // Fallback to the original secretKeyBytes if identity not available
            currentSecretKey = secretKeyBytes!;
          }

          const signedEvent = finalizeEvent(
            authEvent,
            currentSecretKey,
          ) as VerifiedEvent;
          return signedEvent;
        });

        // Set event signer for local keys
        manager.setEventSigner(async (event: EventTemplate) => {
          console.log("[RelayContext] Signing event with local key");
          const currentIdentity = identityRef.current;

          // Get the current secret key based on identity type
          let currentSecretKey: Uint8Array;
          if (currentIdentity?.type === 'local') {
            currentSecretKey = hexToBytes(currentIdentity.secretKey);
          } else {
            // Fallback to the original secretKeyBytes if identity not available
            currentSecretKey = secretKeyBytes!;
          }

          const signedEvent = finalizeEvent(
            event,
            currentSecretKey,
          ) as VerifiedEvent;
          return signedEvent;
        });
      }

      // Create connection promise that can be awaited
      connectionPromiseRef.current = new Promise<void>((resolve) => {
        connectionResolveRef.current = resolve;
      });

      // Set up connection status listener
      manager.onConnectionChange((isConnected) => {
        setConnected(isConnected);
        // Resolve the connection promise when connected
        if (isConnected && connectionResolveRef.current) {
          connectionResolveRef.current();
          connectionResolveRef.current = null;
        }
      });

      // Connect to relay
      manager.connect().catch((err) => {
        console.error("[RelayContext] Failed to connect to relay:", err);
      });

      managerRef.current = manager;
      setRelayManager(manager);

      // Create shared IdentityMigrationService instance first (needed by GroupManager)
      const ms = new IdentityMigrationService(manager);
      migrationServiceRef.current = ms;
      setMigrationService(ms);

      // Create shared GroupManager instance with migration service
      const gm = new GroupManager(manager, ms);
      groupManagerRef.current = gm;
      setGroupManager(gm);

      // Cleanup on unmount
      return () => {
        console.log("[RelayContext] Disposing relay and group managers");
        gm.dispose();
        manager.dispose();
      };
    };

    initializeRelay();
  }, [identity]); // Re-run when identity loads

  const connect = async () => {
    if (managerRef.current) {
      await managerRef.current.connect();
    }
  };

  const disconnect = () => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }

    // Close bunker signer if active
    if (bunkerSignerRef.current) {
      console.log("[RelayContext] Closing bunker signer");
      bunkerSignerRef.current.close();
      bunkerSignerRef.current = null;
    }

    // Close bunker pool if active
    if (bunkerPoolRef.current) {
      console.log("[RelayContext] Closing bunker pool");
      bunkerPoolRef.current.close([]);
      bunkerPoolRef.current = null;
    }
  };

  const manualRetry = () => {
    if (managerRef.current) {
      console.log('[RelayContext] Manual retry triggered by user');
      managerRef.current.resetReconnectAttempts();
      managerRef.current.connect();
    }
  };

  const waitForConnection = async () => {
    // If already connected, return immediately
    if (connected) {
      return;
    }

    // Wait for the connection promise
    if (connectionPromiseRef.current) {
      await connectionPromiseRef.current;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bunkerSignerRef.current) {
        console.log('[RelayContext] Unmounting - closing bunker signer');
        bunkerSignerRef.current.close();
        bunkerSignerRef.current = null;
      }
      if (bunkerPoolRef.current) {
        console.log('[RelayContext] Unmounting - closing bunker pool');
        bunkerPoolRef.current.close([]);
        bunkerPoolRef.current = null;
      }
    };
  }, []);

  return (
    <RelayContext.Provider
      value={{
        relayManager,
        groupManager,
        migrationService,
        connected,
        waitingForBunkerApproval,
        retryInfo,
        connect,
        disconnect,
        manualRetry,
        waitForConnection,
      }}
    >
      {children}
    </RelayContext.Provider>
  );
};
