import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig } from '../src/config/index.js';
import {
  getParticipatingMarketplaceIds,
  resolveMarketplaceId,
  setParticipatingMarketplaceIds,
  validateMarketplaceId,
} from '../src/tools/_shared/marketplace.js';

describe('marketplace helpers', () => {
  beforeEach(() => {
    setParticipatingMarketplaceIds(['ATVPDKIKX0DER', 'A1F83G8C2ARO7P']);
  });

  describe('setParticipatingMarketplaceIds / getParticipatingMarketplaceIds', () => {
    it('stores the provided IDs and returns a copy', () => {
      const ids = ['A1PA6795UKMFR9', 'A13V1IB3VIYBER'];
      setParticipatingMarketplaceIds(ids);

      expect(getParticipatingMarketplaceIds()).toEqual(ids);
      expect(getParticipatingMarketplaceIds()).not.toBe(ids);
    });
  });

  describe('resolveMarketplaceId', () => {
    it('returns the input marketplace ID when provided', () => {
      expect(resolveMarketplaceId('A1F83G8C2ARO7P')).toBe('A1F83G8C2ARO7P');
    });

    it('falls back to the configured MARKETPLACE_ID when no input is provided', () => {
      expect(resolveMarketplaceId()).toBe(getConfig().MARKETPLACE_ID);
    });
  });

  describe('validateMarketplaceId', () => {
    it('does not throw for a participating marketplace ID', () => {
      expect(() => validateMarketplaceId('ATVPDKIKX0DER')).not.toThrow();
    });

    it('throws a clear error for a marketplace ID that is not participating', () => {
      expect(() => validateMarketplaceId('UNKNOWN')).toThrow(
        /Marketplace ID "UNKNOWN" is not in this seller's participating marketplaces/
      );
      expect(() => validateMarketplaceId('UNKNOWN')).toThrow(/ATVPDKIKX0DER/);
      expect(() => validateMarketplaceId('UNKNOWN')).toThrow(/A1F83G8C2ARO7P/);
    });

    it('is a no-op when no participation list has been set', () => {
      setParticipatingMarketplaceIds([]);
      expect(() => validateMarketplaceId('ANYTHING')).not.toThrow();
    });
  });
});
