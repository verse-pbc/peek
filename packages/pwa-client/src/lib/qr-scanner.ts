import { BrowserMultiFormatReader, NotFoundException, Result } from '@zxing/library';

/**
 * QR Payload structure for Peek communities
 */
export interface QRPayload {
  v: number;           // Payload version
  id: string;          // Community UUID
  relay: string;       // Relay URL (wss://peek.hol.is)
  lat: number;         // QR location latitude
  lng: number;         // QR location longitude
  name?: string;       // Optional community name hint
}

/**
 * Result from QR scan
 */
export interface QRScanResult {
  success: boolean;
  payload?: QRPayload;
  error?: string;
  rawData?: string;
}

/**
 * Options for QR scanner
 */
export interface QRScannerOptions {
  onSuccess?: (result: QRScanResult) => void;
  onError?: (error: string) => void;
  onPermissionDenied?: () => void;
  continuousScan?: boolean;
  scanDelay?: number; // Delay between scans in continuous mode (ms)
}

/**
 * QR Scanner for Peek communities
 */
export class QRScanner {
  private reader: BrowserMultiFormatReader;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isScanning = false;
  private options: QRScannerOptions;

  constructor(options: QRScannerOptions = {}) {
    this.reader = new BrowserMultiFormatReader();
    this.options = {
      continuousScan: false,
      scanDelay: 1000,
      ...options,
    };
  }

  /**
   * Start scanning from camera
   */
  async startScanning(videoElement: HTMLVideoElement): Promise<void> {
    if (this.isScanning) {
      console.warn('Scanner is already active');
      return;
    }

    this.videoElement = videoElement;
    this.isScanning = true;

    try {
      // Request camera permission
      const constraints = {
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set video source
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }

      // Start continuous scanning
      this.continuousDecode();
    } catch (error) {
      this.isScanning = false;
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          this.options.onPermissionDenied?.();
        } else {
          this.options.onError?.(error.message);
        }
      }
      
      throw error;
    }
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    this.isScanning = false;

    // Stop video stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Clear video element
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    // Reset reader
    this.reader.reset();
  }

  /**
   * Scan a single QR code from an image file
   */
  async scanFromImage(file: File): Promise<QRScanResult> {
    try {
      const imageUrl = URL.createObjectURL(file);
      const result = await this.reader.decodeFromImageUrl(imageUrl);
      URL.revokeObjectURL(imageUrl);

      return this.processResult(result);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          success: false,
          error: 'No QR code found in image',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan image',
      };
    }
  }

  /**
   * Parse QR payload from raw data
   */
  static parseQRPayload(data: string): QRPayload | null {
    try {
      // Try to parse as JSON
      const payload = JSON.parse(data);

      // Validate required fields
      if (
        typeof payload.v !== 'number' ||
        typeof payload.id !== 'string' ||
        typeof payload.relay !== 'string' ||
        typeof payload.lat !== 'number' ||
        typeof payload.lng !== 'number'
      ) {
        return null;
      }

      // Validate version
      if (payload.v !== 1) {
        console.warn(`Unsupported QR payload version: ${payload.v}`);
        return null;
      }

      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(payload.id)) {
        return null;
      }

      // Validate relay URL
      if (!payload.relay.startsWith('wss://') && !payload.relay.startsWith('ws://')) {
        return null;
      }

      // Validate coordinates
      if (payload.lat < -90 || payload.lat > 90 || payload.lng < -180 || payload.lng > 180) {
        return null;
      }

      return payload as QRPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if camera is available
   */
  static async isCameraAvailable(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === 'videoinput');
    } catch {
      return false;
    }
  }

  /**
   * Request camera permission
   */
  static async requestCameraPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Continuous decode from video stream
   */
  private async continuousDecode(): Promise<void> {
    if (!this.isScanning || !this.videoElement) {
      return;
    }

    try {
      const result = await this.decodeOnce();
      
      if (result) {
        const scanResult = this.processResult(result);
        
        if (scanResult.success) {
          this.options.onSuccess?.(scanResult);
          
          // Stop if not in continuous mode
          if (!this.options.continuousScan) {
            this.stopScanning();
            return;
          }
        }
      }
    } catch (error) {
      // Ignore NotFoundException, continue scanning
      if (!(error instanceof NotFoundException)) {
        console.error('Decode error:', error);
      }
    }

    // Continue scanning after delay
    if (this.isScanning) {
      setTimeout(() => this.continuousDecode(), this.options.scanDelay);
    }
  }

  /**
   * Decode once from video
   */
  private async decodeOnce(): Promise<Result | null> {
    if (!this.videoElement) {
      return null;
    }

    try {
      return await this.reader.decodeFromVideoElement(this.videoElement);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Process scan result
   */
  private processResult(result: Result): QRScanResult {
    const rawData = result.getText();
    const payload = QRScanner.parseQRPayload(rawData);

    if (payload) {
      return {
        success: true,
        payload,
        rawData,
      };
    }

    return {
      success: false,
      error: 'Invalid QR code format for Peek',
      rawData,
    };
  }
}

/**
 * Utility function to generate QR code data
 */
export function generateQRPayload(
  id: string,
  lat: number,
  lng: number,
  relay: string = 'wss://peek.hol.is',
  name?: string,
): string {
  const payload: QRPayload = {
    v: 1,
    id,
    relay,
    lat,
    lng,
    ...(name && { name }),
  };

  return JSON.stringify(payload);
}

/**
 * Validate QR payload
 */
export function validateQRPayload(payload: QRPayload): { valid: boolean; error?: string } {
  // Check version
  if (payload.v !== 1) {
    return { valid: false, error: 'Unsupported QR version' };
  }

  // Check UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(payload.id)) {
    return { valid: false, error: 'Invalid community ID format' };
  }

  // Check relay URL
  if (!payload.relay.startsWith('wss://') && !payload.relay.startsWith('ws://')) {
    return { valid: false, error: 'Invalid relay URL' };
  }

  // Check coordinates
  if (payload.lat < -90 || payload.lat > 90) {
    return { valid: false, error: 'Invalid latitude' };
  }

  if (payload.lng < -180 || payload.lng > 180) {
    return { valid: false, error: 'Invalid longitude' };
  }

  return { valid: true };
}