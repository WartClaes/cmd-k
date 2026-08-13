import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { hasRequiredModifier } from './shortcut';

export interface CmdkConfig {
  shortcut: string;
}

export const DEFAULT_CMDK_CONFIG: CmdkConfig = { shortcut: 'mod+k' };

export const CMDK_CONFIG = new InjectionToken<CmdkConfig>('CMDK_CONFIG', {
  factory: () => DEFAULT_CMDK_CONFIG,
});

export function provideCmdk(config: Partial<CmdkConfig> = {}): EnvironmentProviders {
  const merged = { ...DEFAULT_CMDK_CONFIG, ...config };
  if (!hasRequiredModifier(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
  }
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: merged }]);
}
