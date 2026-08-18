import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { hasExactlyOneKey, hasRequiredModifier } from './shortcut';

export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
}

export const DEFAULT_CMDK_CONFIG: CmdkConfig = { shortcut: 'mod+k', searchTimeoutMs: 5000 };

export const CMDK_CONFIG = new InjectionToken<CmdkConfig>('CMDK_CONFIG', {
  factory: () => DEFAULT_CMDK_CONFIG,
});

export function provideCmdk(config: Partial<CmdkConfig> = {}): EnvironmentProviders {
  const merged = { ...DEFAULT_CMDK_CONFIG, ...config };
  if (!hasRequiredModifier(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
  }
  if (!hasExactlyOneKey(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must have exactly one key in addition to its modifier(s)`);
  }
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: merged }]);
}
