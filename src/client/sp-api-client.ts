import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getConfig } from '../config/index.js';
import { getTokenManager } from '../auth/token-manager.js';
import { getRateLimiter } from './rate-limiter.js';

export interface SPAPIRequestOptions {
  rateLimitCategory?: string;
  retries?: number;
  retryDelay?: number;
  params?: Record<string, unknown>;
  accessToken?: string;
}

export class SPAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public retryable: boolean = false,
    public details?: string
  ) {
    super(message);
    this.name = 'SPAPIError';
  }
}

export class SPAPIClient {
  private client;

  constructor() {
    const config = getConfig();

    this.client = axios.create({
      baseURL: config.SP_API_ENDPOINT,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'amazon-seller-mcp/1.0.0 (Language=TypeScript)',
      },
    });

    // Add request interceptor to attach access token
    this.client.interceptors.request.use(async (requestConfig) => {
      // Respect an explicitly provided access token (e.g., a restricted data token).
      if (!requestConfig.headers['x-amz-access-token']) {
        const tokenManager = getTokenManager();
        const accessToken = await tokenManager.getAccessToken();

        requestConfig.headers['x-amz-access-token'] = accessToken;
      }
      requestConfig.headers['x-amz-date'] = new Date().toISOString();

      return requestConfig;
    });
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    options: SPAPIRequestOptions = {}
  ): Promise<T> {
    return this.request<T>({
      method: 'GET',
      url: path,
      params,
      ...options,
    });
  }

  async post<T>(
    path: string,
    data?: unknown,
    options: SPAPIRequestOptions = {}
  ): Promise<T> {
    return this.request<T>({
      method: 'POST',
      url: path,
      data,
      ...options,
    });
  }

  async put<T>(
    path: string,
    data?: unknown,
    options: SPAPIRequestOptions = {}
  ): Promise<T> {
    return this.request<T>({
      method: 'PUT',
      url: path,
      data,
      ...options,
    });
  }

  async delete<T>(path: string, options: SPAPIRequestOptions = {}): Promise<T> {
    return this.request<T>({
      method: 'DELETE',
      url: path,
      ...options,
    });
  }

  async patch<T>(
    path: string,
    data?: unknown,
    options: SPAPIRequestOptions = {}
  ): Promise<T> {
    return this.request<T>({
      method: 'PATCH',
      url: path,
      data,
      ...options,
    });
  }

  private async request<T>(
    config: AxiosRequestConfig & SPAPIRequestOptions
  ): Promise<T> {
    const { rateLimitCategory = 'default', retries = 3, retryDelay = 1000, accessToken, ...axiosConfig } = config;

    if (accessToken) {
      axiosConfig.headers = {
        ...axiosConfig.headers,
        'x-amz-access-token': accessToken,
      };
    }

    // Acquire rate limit token before making request
    const rateLimiter = getRateLimiter(rateLimitCategory);
    await rateLimiter.acquire();

    let lastError: Error | null = null;
    let tokenRefreshed = false;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response: AxiosResponse<T> = await this.client.request(axiosConfig);
        return response.data;
      } catch (error) {
        lastError = this.handleError(error);

        // On HTTP 401, clear the cached token and retry exactly once so the request
        // interceptor fetches a fresh access token.
        if (
          lastError instanceof SPAPIError &&
          lastError.statusCode === 401 &&
          !tokenRefreshed
        ) {
          getTokenManager().clearCache();
          tokenRefreshed = true;
          continue;
        }

        // Only retry on retryable errors
        if (lastError instanceof SPAPIError && lastError.retryable && attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
          await this.sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError;
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      // Rate limiting
      if (status === 429) {
        return new SPAPIError(
          'Rate limited by Amazon SP-API. Please try again later.',
          429,
          'RATE_LIMITED',
          true
        );
      }

      // Authentication errors
      if (status === 401) {
        return new SPAPIError(
          'Authentication failed. Please check your LWA credentials.',
          401,
          'UNAUTHORIZED',
          false
        );
      }

      if (status === 403) {
        return new SPAPIError(
          'Access forbidden. Please verify your seller permissions.',
          403,
          'FORBIDDEN',
          false
        );
      }

      // Server errors (retryable)
      if (status && status >= 500) {
        return new SPAPIError(
          `Amazon SP-API server error: ${status}`,
          status,
          'SERVER_ERROR',
          true
        );
      }

      // Client errors. Amazon returns errors[] with code + message + (often) details;
      // the details field names the offending argument, so surface it instead of dropping it.
      if (status && status >= 400) {
        const apiError = data?.errors?.[0];
        const baseMessage = apiError?.message || data?.message || error.message;
        const details = apiError?.details;
        const errorMessage = details ? `${baseMessage} (${details})` : baseMessage;
        const errorCode = apiError?.code || 'CLIENT_ERROR';
        return new SPAPIError(errorMessage, status, errorCode, false, details);
      }

      // Network errors (retryable)
      if (
        error.code === 'ECONNABORTED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
      ) {
        return new SPAPIError(
          `Network error: ${error.message}`,
          undefined,
          'NETWORK_ERROR',
          true
        );
      }

      return new SPAPIError(error.message);
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let clientInstance: SPAPIClient | null = null;

export function getSPAPIClient(): SPAPIClient {
  if (!clientInstance) {
    clientInstance = new SPAPIClient();
  }
  return clientInstance;
}
