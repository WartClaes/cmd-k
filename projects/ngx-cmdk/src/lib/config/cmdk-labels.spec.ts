import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideCmdk } from './cmdk-config';
import { CmdkLabelsService, DEFAULT_CMDK_LABELS } from './cmdk-labels';

describe('CmdkLabelsService', () => {
  it('returns all English defaults when no labels callback is configured', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    const service = TestBed.inject(CmdkLabelsService);
    expect(service.labels()).toEqual(DEFAULT_CMDK_LABELS);
  });

  it('merges a partial override over the defaults, leaving unset keys unchanged', () => {
    TestBed.configureTestingModule({
      providers: [provideCmdk({ labels: () => ({ closeSettings: 'FERMER' }) })],
    });
    const service = TestBed.inject(CmdkLabelsService);
    expect(service.labels().closeSettings).toBe('FERMER');
    expect(service.labels().footerNavigate).toBe(DEFAULT_CMDK_LABELS.footerNavigate);
  });

  it('re-computes live when the labels callback reads a signal that later changes', () => {
    const activeLabel = signal('English close');
    TestBed.configureTestingModule({
      providers: [provideCmdk({ labels: () => ({ closeSettings: activeLabel() }) })],
    });
    const service = TestBed.inject(CmdkLabelsService);
    expect(service.labels().closeSettings).toBe('English close');

    activeLabel.set('French close');
    TestBed.tick();

    expect(service.labels().closeSettings).toBe('French close');
  });
});
