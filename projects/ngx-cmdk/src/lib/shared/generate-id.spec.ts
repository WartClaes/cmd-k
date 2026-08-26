import { generateId } from './generate-id';

describe('generateId', () => {
  it('falls back to the given prefix when crypto.randomUUID is unavailable', () => {
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('randomUUID is not available in this context');
    });
    try {
      expect(generateId('cmdk-fav-')).toMatch(/^cmdk-fav-/);
    } finally {
      randomUUIDSpy.mockRestore();
    }
  });

  it('returns different values on successive calls', () => {
    expect(generateId('cmdk-')).not.toBe(generateId('cmdk-'));
  });

  it('falls back to a non-crypto id when crypto.randomUUID throws (e.g. an insecure context)', () => {
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('randomUUID is not available in this context');
    });
    try {
      expect(generateId('cmdk-')).toMatch(/^cmdk-/);
    } finally {
      randomUUIDSpy.mockRestore();
    }
  });
});
