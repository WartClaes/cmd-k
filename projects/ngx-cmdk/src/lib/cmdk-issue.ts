import { Injectable } from '@angular/core';

export type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown };

@Injectable({ providedIn: 'root' })
export class CmdkIssueService {
  private readonly listeners = new Set<(issue: CmdkIssue) => void>();

  report(issue: CmdkIssue): void {
    for (const listener of this.listeners) {
      try {
        listener(issue);
      } catch (error) {
        console.error('A CmdkIssueService listener threw:', error);
      }
    }
  }

  onIssue(callback: (issue: CmdkIssue) => void): () => void {
    this.listeners.add(callback);
    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.listeners.delete(callback);
    };
  }
}
