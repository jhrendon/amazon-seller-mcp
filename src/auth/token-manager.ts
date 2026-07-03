import axios from 'axios';
import { getConfig } from '../config/index.js';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface LWATokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export class TokenManager {
  private cache: TokenCache | null = null;
  private refreshPromise: Promise<string> | null = null;

  // Refresh token 5 minutes before expiry to avoid edge cases
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  async getAccessToken(): Promise<string> {
    // If we have a valid cached token, return it
    if (this.isTokenValid()) {
      return this.cache!.accessToken;
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh
    this.refreshPromise = this.refreshToken();

    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private isTokenValid(): boolean {
    if (!this.cache) {
      return false;
    }
    return Date.now() < this.cache.expiresAt - this.REFRESH_BUFFER_MS;
  }

  private async refreshToken(): Promise<string> {
    const config = getConfig();

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.LWA_REFRESH_TOKEN,
      client_id: config.LWA_CLIENT_ID,
      client_secret: config.LWA_CLIENT_SECRET,
    });

    try {
      const response = await axios.post<LWATokenResponse>(LWA_TOKEN_URL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in } = response.data;

      this.cache = {
        accessToken: access_token,
        expiresAt: Date.now() + expires_in * 1000,
      };

      return access_token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description || error.message;
        throw new Error(`Failed to refresh LWA access token: ${message}`);
      }
      throw error;
    }
  }

  // Clear the cache (useful for testing or forcing a refresh)
  clearCache(): void {
    this.cache = null;
  }
}

// Singleton instance
let tokenManagerInstance: TokenManager | null = null;

export function getTokenManager(): TokenManager {
  if (!tokenManagerInstance) {
    tokenManagerInstance = new TokenManager();
  }
  return tokenManagerInstance;
}
