import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

export interface CmdkConfig {
  shortcut: string;
}

export const DEFAULT_CMDK_CONFIG: CmdkConfig = { shortcut: 'mod+k' };

export const CMDK_CONFIG = new InjectionToken<CmdkConfig>('CMDK_CONFIG', {
  factory: () => DEFAULT_CMDK_CONFIG,
});

export function provideCmdk(config: Partial<CmdkConfig> = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: { ...DEFAULT_CMDK_CONFIG, ...config } }]);
}
