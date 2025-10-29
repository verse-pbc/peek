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
import { useNostrLogin } from "@/lib/nostrify-shim";

interface RelayContextType {
  relayManager: RelayManager | null;
  groupManager: GroupManager | null;
  migrationService: IdentityMigrationService | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
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
  const [relayManager, setRelayManager] = useState<RelayManager | null>(null);
  const [groupManager, setGroupManager] = useState<GroupManager | null>(null);
  const [migrationService, setMigrationService] =
    useState<IdentityMigrationService | null>(null);
  const [connected, setConnected] = useState(false);
  const managerRef = useRef<RelayManager | null>(null);
  const groupManagerRef = useRef<GroupManager | null>(null);
  const migrationServiceRef = useRef<IdentityMigrationService | null>(null);
  const connectionPromiseRef = useRef<Promise<void> | null>(null);
  const connectionResolveRef = useRef<(() => void) | null>(null);
  const { identity } = useNostrLogin();
  const identityRef = useRef(identity);
  const previousPubkeyRef = useRef<string | null>(null);

  // Keep identity ref up to date
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  // Force reconnection when tab becomes visible (handles sleep/wake)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && managerRef.current) {
        console.log('[RelayContext] Tab visible, forcing fresh connection');

        // Disconnect to clear any zombie connection
        managerRef.current.disconnect();

        // Connect with fresh WebSocket
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
        personalIdentity?.secretKey === "NIP07_EXTENSION" &&
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

        if (
          (identity?.secretKey && identity?.publicKey) ||
          (personalIdentity?.secretKey && personalIdentity?.publicKey)
        ) {
          // Use stored identity (unified single source)
          const authIdentity = personalIdentity || identity;

          // Check if this is actually a NIP-07 extension identity
          const secretKeyValue = authIdentity.secretKey?.trim();

          // Log for debugging (NEVER log secret key value!)
          console.log('[RelayContext] Checking secretKey:', {
            type: typeof secretKeyValue,
            length: secretKeyValue?.length,
            isNIP07: secretKeyValue === 'NIP07_EXTENSION',
            isHex: /^[0-9a-f]{64}$/i.test(secretKeyValue || '')
          });

          if (secretKeyValue === 'NIP07_EXTENSION') {
            // Extension identity but extension check failed - use public key only
            console.log("[RelayContext] NIP-07 identity detected, using public key without secret key");
            publicKeyHex = authIdentity.publicKey;
            // secretKeyBytes remains undefined - extension will handle signing
          } else if (secretKeyValue && /^[0-9a-f]{64}$/i.test(secretKeyValue)) {
            // Valid hex secret key - use it
            const identityType = authIdentity.isAutoGenerated ? 'anonymous' : 'user';
            console.log(`[RelayContext] Using ${identityType} identity for auth:`, authIdentity.publicKey.slice(0, 8) + '...');
            secretKeyBytes = hexToBytes(secretKeyValue);
            publicKeyHex = authIdentity.publicKey;
          } else {
            // Invalid or missing secret key
            console.error('[RelayContext] Invalid secret key format - length:', secretKeyValue?.length);
            publicKeyHex = authIdentity.publicKey;
            // secretKeyBytes remains undefined
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
      const isNIP07Identity = personalIdentity?.secretKey === "NIP07_EXTENSION";
      const shouldUseExtension = usingExtension || isNIP07Identity;

      if (shouldUseExtension) {
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

          // Get the current secret key
          let currentSecretKey: Uint8Array;
          if (
            currentIdentity?.secretKey &&
            currentIdentity.secretKey !== "NIP07_EXTENSION"
          ) {
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

          // Get the current secret key
          let currentSecretKey: Uint8Array;
          if (
            currentIdentity?.secretKey &&
            currentIdentity.secretKey !== "NIP07_EXTENSION"
          ) {
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

  return (
    <RelayContext.Provider
      value={{
        relayManager,
        groupManager,
        migrationService,
        connected,
        connect,
        disconnect,
        waitForConnection,
      }}
    >
      {children}
    </RelayContext.Provider>
  );
};
