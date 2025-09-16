import axios, { AxiosError } from 'axios';

// Get API URL from environment or use default
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create axios instance with defaults
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API] Response ${response.status}:`, response.data);
    return response;
  },
  (error: AxiosError) => {
    console.error('[API] Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Types for API requests and responses
export interface ValidateLocationRequest {
  community_id: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  };
  user_pubkey: string;
}

export interface CommunityPreview {
  name: string;
  description: string;
  member_count: number;
  created_at: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  is_first_scan: boolean;
}

export interface ValidateLocationResponse {
  success: boolean;
  is_member?: boolean;
  is_admin?: boolean;
  group_id?: string;
  relay_url?: string;
  preview?: CommunityPreview;
  error?: string;
  error_code?: string;
}

// API service class
export class PeekAPI {
  /**
   * Validate location and get community access
   */
  static async validateLocation(
    request: ValidateLocationRequest
  ): Promise<ValidateLocationResponse> {
    try {
      const response = await apiClient.post<ValidateLocationResponse>(
        '/api/validate-location',
        request
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Return error response if available
        if (error.response?.data) {
          return error.response.data as ValidateLocationResponse;
        }
        // Network or timeout error
        return {
          success: false,
          error: error.message || 'Network error occurred',
          error_code: 'NETWORK_ERROR'
        };
      }
      // Unknown error
      return {
        success: false,
        error: 'An unexpected error occurred',
        error_code: 'UNKNOWN_ERROR'
      };
    }
  }

  /**
   * Health check endpoint
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await apiClient.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

// Export for convenience
export default PeekAPI;