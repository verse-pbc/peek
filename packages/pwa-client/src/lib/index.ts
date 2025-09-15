// QR Scanner exports
export { QRScanner } from './qr-scanner';
export type { QRData, QRScanResult, QRScannerOptions } from './qr-scanner';
export { generateQRUrl, generateCommunityId, validateQRData } from './qr-scanner';
export { useQRScanner } from './useQRScanner';
export type { UseQRScannerOptions, UseQRScannerReturn } from './useQRScanner';

// Location Capture exports
export { LocationCapture } from './location-capture';
export type { 
  CapturedLocation, 
  LocationCaptureOptions, 
  LocationCaptureResult,
  LocationValidation 
} from './location-capture';
export { 
  serializeLocation, 
  deserializeLocation, 
  createLocationData
} from './location-capture';
export { 
  useLocationCapture, 
  useLocationValidation, 
  useCommunityLocationSetter 
} from './useLocationCapture';
export type { 
  UseLocationCaptureOptions, 
  UseLocationCaptureReturn 
} from './useLocationCapture';

// Nostrify shim exports  
export * from './nostrify-shim';