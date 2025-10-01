// Pure functions for join flow error handling
// Data-oriented: error parsing and transformation without side effects

export interface JoinFlowError {
  message: string;
  code: string;
  canRetry: boolean;
}

/**
 * Parse validation response error into user-friendly error
 * Pure function: same input → same output
 */
export function parseValidationError(
  errorMessage: string,
  errorCode: string
): JoinFlowError {
  let userMessage = errorMessage;
  let canRetry = true;

  switch (errorCode) {
    case 'LOCATION_INVALID':
      // Check specific sub-cases
      if (errorMessage.includes('Too far from location') ||
          errorMessage.includes('GPS accuracy too poor')) {
        userMessage = errorMessage; // Already user-friendly
        canRetry = true;
      }
      break;

    case 'INVALID_ID':
      userMessage = 'Invalid QR code format';
      canRetry = false;
      break;

    case 'COMMUNITY_ERROR':
      userMessage = 'Failed to access community information';
      canRetry = true;
      break;

    default:
      userMessage = errorMessage;
      canRetry = true;
  }

  return {
    message: userMessage,
    code: errorCode,
    canRetry
  };
}

/**
 * Parse exception into user-friendly error
 * Pure function: analyzes error object and returns appropriate message
 */
export function parseExceptionError(err: unknown): JoinFlowError {
  const errorMessage = (err as Error).message || String(err);

  // Connection/network errors
  if (errorMessage.includes('not initialized') ||
      errorMessage.includes('not connected')) {
    return {
      message: 'Connection issue. Please wait a moment and try again.',
      code: 'NETWORK_ERROR',
      canRetry: true
    };
  }

  // Timeout errors
  if (errorMessage.includes('timeout') ||
      errorMessage.includes('Validation timeout')) {
    return {
      message: 'Validation timed out. The service may be unavailable.',
      code: 'TIMEOUT',
      canRetry: true
    };
  }

  // Generic network error
  return {
    message: 'Failed to validate location. Please check your connection and try again.',
    code: 'NETWORK_ERROR',
    canRetry: true
  };
}
