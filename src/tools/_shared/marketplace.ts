import { getConfig } from '../../config/index.js';

let participatingMarketplaceIds: string[] = [];

export function setParticipatingMarketplaceIds(ids: string[]): void {
  participatingMarketplaceIds = [...ids];
}

export function getParticipatingMarketplaceIds(): string[] {
  return [...participatingMarketplaceIds];
}

export function resolveMarketplaceId(inputMarketplaceId?: string): string {
  if (inputMarketplaceId) {
    return inputMarketplaceId;
  }
  return getConfig().MARKETPLACE_ID;
}

export function validateMarketplaceId(id: string): void {
  if (participatingMarketplaceIds.length === 0) {
    return;
  }

  if (!participatingMarketplaceIds.includes(id)) {
    throw new Error(
      `Marketplace ID "${id}" is not in this seller's participating marketplaces: [${participatingMarketplaceIds.join(', ')}].`
    );
  }
}
