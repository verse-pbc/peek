import { useEffect, useRef } from 'react';

interface PollingOptions {
  enabled: boolean;
  interval?: number;
  timeout?: number;
}

/**
 * Hook to poll for membership updates during migration
 * Data-oriented: clear input/output, manages side effects internally
 */
export function useMigrationPolling(
  checkFn: () => Promise<boolean>,
  onComplete: () => void,
  onTimeout: () => void,
  options: PollingOptions
) {
  const {
    enabled,
    interval = 2000,
    timeout = 30000
  } = options;

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    console.log('[useMigrationPolling] Starting polling...');

    // Set up polling
    pollIntervalRef.current = setInterval(async () => {
      const result = await checkFn();

      if (result) {
        console.log('[useMigrationPolling] Condition met, calling onComplete');

        // Clean up
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        onComplete();
      }
    }, interval);

    // Set up timeout
    timeoutRef.current = setTimeout(() => {
      console.warn('[useMigrationPolling] Polling timed out');

      // Clean up interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      onTimeout();
    }, timeout);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, checkFn, onComplete, onTimeout, interval, timeout]);
}
