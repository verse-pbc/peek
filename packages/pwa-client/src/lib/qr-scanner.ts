import { BrowserMultiFormatReader, NotFoundException, Result } from '@zxing/library';

/**
 * QR Data structure for Peek communities
 * QR codes contain only a URL with a unique identifier
 */
export interface QRData {
  url: string;         // Full URL from QR code
  communityId: string; // Extracted UUID or identifier from URL
}

/**
 * Result from QR scan
 */
export interface QRScanResult {
  success: boolean;
  data?: QRData;
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
   * Parse QR data from raw URL string
   */
  static parseQRData(data: string): QRData | null {
    try {
      // Remove any whitespace
      const trimmedData = data.trim();
      
      // Check if it's a valid URL
      let url: URL;
      try {
        url = new URL(trimmedData);
      } catch {
        // If not a full URL, it might be a relative path
        // Try to construct with a default base
        if (trimmedData.startsWith('/c/')) {
          // This would be handled by the app when deployed
          return {
            url: trimmedData,
            communityId: trimmedData.replace('/c/', '').split('/')[0].split('?')[0],
          };
        }
        return null;
      }

      // Extract community ID from path
      // Expected format: https://peek.com/c/{uuid}
      const pathMatch = url.pathname.match(/^\/c\/([a-zA-Z0-9-_]+)/);
      if (!pathMatch || !pathMatch[1]) {
        return null;
      }

      const communityId = pathMatch[1];
      
      // Validate the community ID format (UUID or other identifier)
      // Allow UUIDs and also simpler alphanumeric identifiers
      const isValidId = /^[a-zA-Z0-9-_]+$/.test(communityId) && 
                       communityId.length >= 8 && 
                       communityId.length <= 64;
      
      if (!isValidId) {
        return null;
      }

      return {
        url: trimmedData,
        communityId,
      };
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
    const qrData = QRScanner.parseQRData(rawData);

    if (qrData) {
      return {
        success: true,
        data: qrData,
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
 * Utility function to generate QR code URL
 */
export function generateQRUrl(
  communityId: string,
  baseUrl: string = window.location.origin,
): string {
  // Ensure the community ID is valid
  if (!/^[a-zA-Z0-9-_]+$/.test(communityId) || 
      communityId.length < 8 || 
      communityId.length > 64) {
    throw new Error('Invalid community ID format');
  }
  
  return `${baseUrl}/c/${communityId}`;
}

/**
 * Generate a random community ID
 */
export function generateCommunityId(): string {
  // Generate a UUID v4-like identifier
  const segments = [
    randomHex(8),
    randomHex(4),
    '4' + randomHex(3), // Version 4
    randomHex(4),
    randomHex(12),
  ];
  return segments.join('-');
}

function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Validate QR data
 */
export function validateQRData(data: QRData): { valid: boolean; error?: string } {
  // Check if URL is present
  if (!data.url) {
    return { valid: false, error: 'Missing URL' };
  }

  // Check community ID format
  if (!/^[a-zA-Z0-9-_]+$/.test(data.communityId) || 
      data.communityId.length < 8 || 
      data.communityId.length > 64) {
    return { valid: false, error: 'Invalid community ID format' };
  }

  return { valid: true };
}