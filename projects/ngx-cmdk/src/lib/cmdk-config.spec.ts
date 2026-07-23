import { TestBed } from '@angular/core/testing';
import { CMDK_CONFIG, DEFAULT_CMDK_CONFIG, provideCmdk } from './cmdk-config';

describe('provideCmdk', () => {
  it('provides the default config when called with no arguments', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual(DEFAULT_CMDK_CONFIG);
  });

  it('overrides only the provided fields', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ shortcut: 'ctrl+p' })] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual({ shortcut: 'ctrl+p' });
  });
});

describe('CMDK_CONFIG default factory', () => {
  it('falls back to the default config when provideCmdk is never called', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(CMDK_CONFIG)).toEqual(DEFAULT_CMDK_CONFIG);
  });
});
