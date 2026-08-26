export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // crypto.randomUUID() is restricted to secure contexts; fall back below.
    }
  }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
