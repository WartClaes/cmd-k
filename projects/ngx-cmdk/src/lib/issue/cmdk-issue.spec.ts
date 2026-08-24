import { TestBed } from '@angular/core/testing';
import { CmdkIssueService } from './cmdk-issue';

describe('CmdkIssueService', () => {
  let service: CmdkIssueService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CmdkIssueService);
  });

  it('does nothing when there are no listeners', () => {
    expect(() =>
      service.report({ source: 'command', commandId: 'x', error: new Error('boom') }),
    ).not.toThrow();
  });

  it('invokes a registered listener with the reported issue', () => {
    const listener = vi.fn();
    service.onIssue(listener);
    const issue = { source: 'command' as const, commandId: 'x', error: new Error('boom') };
    service.report(issue);
    expect(listener).toHaveBeenCalledWith(issue);
  });

  it('invokes multiple registered listeners', () => {
    const first = vi.fn();
    const second = vi.fn();
    service.onIssue(first);
    service.onIssue(second);
    const issue = { source: 'search-result' as const, label: 'x', error: new Error('boom') };
    service.report(issue);
    expect(first).toHaveBeenCalledWith(issue);
    expect(second).toHaveBeenCalledWith(issue);
  });

  it('stops invoking a listener after it unregisters', () => {
    const listener = vi.fn();
    const unregister = service.onIssue(listener);
    unregister();
    service.report({ source: 'command', commandId: 'x', error: new Error('boom') });
    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op when unregister is called more than once', () => {
    const listener = vi.fn();
    const unregister = service.onIssue(listener);
    unregister();
    expect(() => unregister()).not.toThrow();
  });

  it('does not let a throwing listener prevent other listeners from running', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing = vi.fn(() => {
      throw new Error('listener boom');
    });
    const other = vi.fn();
    service.onIssue(throwing);
    service.onIssue(other);
    const issue = { source: 'search-provider' as const, key: 'x', query: 'q', reason: 'error' as const };
    expect(() => service.report(issue)).not.toThrow();
    expect(other).toHaveBeenCalledWith(issue);
    consoleError.mockRestore();
  });

  it('reports a recent-resolve issue and delivers it to listeners', () => {
    const received: unknown[] = [];
    service.onIssue((issue) => received.push(issue));

    service.report({ source: 'recent-resolve', providerKey: 'fruits', resultId: 'apple', error: new Error('gone') });

    expect(received).toEqual([
      { source: 'recent-resolve', providerKey: 'fruits', resultId: 'apple', error: new Error('gone') },
    ]);
  });

  it('reports a favourite-navigate issue and delivers it to listeners', () => {
    const received: unknown[] = [];
    service.onIssue((issue) => received.push(issue));

    service.report({
      source: 'favourite-navigate',
      label: 'Production orders',
      path: '/production-orders',
      error: new Error('navigation failed'),
    });

    expect(received).toEqual([
      {
        source: 'favourite-navigate',
        label: 'Production orders',
        path: '/production-orders',
        error: new Error('navigation failed'),
      },
    ]);
  });
});
