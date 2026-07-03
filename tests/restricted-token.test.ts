import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();

vi.mock('../src/client/sp-api-client.js', () => ({
  getSPAPIClient: () => ({
    post: postMock,
  }),
}));

import { createRestrictedDataToken } from '../src/auth/restricted-token.js';

describe('createRestrictedDataToken', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('calls the Tokens API with restricted resources', async () => {
    postMock.mockResolvedValue({
      restrictedDataToken: 'rdt-abc',
      expiresIn: 3600,
    });

    const result = await createRestrictedDataToken([
      { method: 'GET', path: '/orders/v0/orders', dataElements: ['buyerInfo', 'shippingAddress'] },
    ]);

    expect(postMock).toHaveBeenCalledWith(
      '/tokens/2021-03-01/restrictedDataToken',
      {
        restrictedResources: [{ method: 'GET', path: '/orders/v0/orders', dataElements: ['buyerInfo', 'shippingAddress'] }],
      },
      expect.objectContaining({ rateLimitCategory: 'tokens' })
    );
    expect(result.restrictedDataToken).toBe('rdt-abc');
    expect(result.expiresIn).toBe(3600);
  });

  it('supports multiple restricted resources', async () => {
    postMock.mockResolvedValue({ restrictedDataToken: 'rdt-multi' });

    await createRestrictedDataToken([
      { method: 'GET', path: '/orders/v0/orders', dataElements: ['buyerInfo'] },
      { method: 'GET', path: '/orders/v0/orders/{orderId}/address', dataElements: ['shippingAddress'] },
    ]);

    expect(postMock).toHaveBeenCalledWith(
      '/tokens/2021-03-01/restrictedDataToken',
      expect.objectContaining({
        restrictedResources: expect.arrayContaining([
          expect.objectContaining({ path: '/orders/v0/orders', dataElements: ['buyerInfo'] }),
          expect.objectContaining({ path: '/orders/v0/orders/{orderId}/address', dataElements: ['shippingAddress'] }),
        ]),
      }),
      expect.any(Object)
    );
  });
});
