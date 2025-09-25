import { useRef, useState, useCallback, useEffect } from 'react';
import { QRScanner, QRData, QRScanResult, QRScannerOptions } from './qr-scanner';

export interface UseQRScannerOptions {
  onSuccess?: (data: QRData) => void;
  onError?: (error: string) => void;
  continuousScan?: boolean;
  scanDelay?: number;
}

export interface UseQRScannerReturn {
  isScanning: boolean;
  error: string | null;
  lastResult: QRData | null;
  startScanning: () => Promise<void>;
  stopScanning: () => void;
  scanFromImage: (file: File) => Promise<QRScanResult>;
  videoRef: React.RefObject<HTMLVideoElement>;
  hasPermission: boolean | null;
  requestPermission: () => Promise<void>;
}

/**
 * React hook for QR scanning
 */
export function useQRScanner(options: UseQRScannerOptions = {}): UseQRScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<QRData | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QRScanner | null>(null);

  // Initialize scanner
  useEffect(() => {
    const scannerOptions: QRScannerOptions = {
      onSuccess: (result: QRScanResult) => {
        if (result.success && result.data) {
          setLastResult(result.data);
          setError(null);
          options.onSuccess?.(result.data);
        } else {
          setError(result.error || 'Invalid QR code');
          options.onError?.(result.error || 'Invalid QR code');
        }
      },
      onError: (err: string) => {
        setError(err);
        setIsScanning(false);
        options.onError?.(err);
      },
      onPermissionDenied: () => {
        setError('Camera permission denied');
        setHasPermission(false);
        setIsScanning(false);
        options.onError?.('Camera permission denied');
      },
      continuousScan: options.continuousScan,
      scanDelay: options.scanDelay,
    };

    scannerRef.current = new QRScanner(scannerOptions);

    // Check initial camera availability
    QRScanner.isCameraAvailable().then(available => {
      if (!available) {
        setError('No camera found');
      }
    });

    // Cleanup on unmount
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stopScanning();
      }
    };
  }, [options]);

  // Request camera permission
  const requestPermission = useCallback(async () => {
    try {
      const granted = await QRScanner.requestCameraPermission();
      setHasPermission(granted);
      if (!granted) {
        setError('Camera permission denied');
      }
    } catch {
      setHasPermission(false);
      setError('Failed to request camera permission');
    }
  }, []);

  // Start scanning
  const startScanning = useCallback(async () => {
    if (!videoRef.current) {
      setError('Video element not ready');
      return;
    }

    if (!scannerRef.current) {
      setError('Scanner not initialized');
      return;
    }

    setError(null);
    setIsScanning(true);

    try {
      await scannerRef.current.startScanning(videoRef.current);
      setHasPermission(true);
    } catch (err) {
      setIsScanning(false);
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  }, []);

  // Stop scanning
  const stopScanning = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stopScanning();
    }
    setIsScanning(false);
  }, []);

  // Scan from image file
  const scanFromImage = useCallback(async (file: File): Promise<QRScanResult> => {
    if (!scannerRef.current) {
      return {
        success: false,
        error: 'Scanner not initialized',
      };
    }

    const result = await scannerRef.current.scanFromImage(file);
    
    if (result.success && result.data) {
      setLastResult(result.data);
      setError(null);
      options.onSuccess?.(result.data);
    } else {
      setError(result.error || 'Failed to scan image');
    }

    return result;
  }, [options]);

  // Stop scanning on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return {
    isScanning,
    error,
    lastResult,
    startScanning,
    stopScanning,
    scanFromImage,
    videoRef,
    hasPermission,
    requestPermission,
  };
}