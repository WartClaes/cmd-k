import { TestBed } from '@angular/core/testing';
import { DemoActivityLog } from './demo-activity-log';

describe('DemoActivityLog', () => {
  it('prepends new entries and keeps only the most recent 10', () => {
    TestBed.configureTestingModule({});
    const log = TestBed.inject(DemoActivityLog);
    for (let i = 0; i < 12; i++) {
      log.log(`entry ${i}`);
    }
    expect(log.recent()).toHaveLength(10);
    expect(log.recent()[0]).toBe('entry 11');
  });
});
