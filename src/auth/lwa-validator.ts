import { getTokenManager } from './token-manager.js';

export async function refreshLwaTokenForValidation(): Promise<string> {
  return getTokenManager().getAccessToken();
}
