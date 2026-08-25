import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { hasExactlyOneKey, hasRequiredModifier, usesDigitKey } from '../shortcut/shortcut';
import type { CmdkLabels } from './cmdk-labels';

export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;
  navigate?: (path: string) => void | Promise<void>;
  labels?: () => Partial<CmdkLabels>;
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
  if (usesDigitKey(merged.shortcut)) {
    throw new Error(
      `Shortcut "${merged.shortcut}" cannot use a digit key — digits are reserved for favourite shortcuts (mod+1 through mod+9)`,
    );
  }
  if (!hasExactlyOneKey(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must have exactly one key in addition to its modifier(s)`);
  }
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: merged }]);
}
