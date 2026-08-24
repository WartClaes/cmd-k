import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { demoNavigateTarget } from './app.config';
import { DemoActivityLog } from './demo-activity-log';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the page heading', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('ngx-cmdk');
  });

  it('wires demoNavigateTarget.current to log a navigation to the activity log', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const activityLog = TestBed.inject(DemoActivityLog);

    demoNavigateTarget.current('/production-orders');

    expect(activityLog.recent()[0]).toBe('Navigated to "/production-orders"');
  });
});
