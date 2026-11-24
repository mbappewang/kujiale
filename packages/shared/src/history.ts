/**
 * Proxy-safe deep clone for JSON-serializable scene & state structures.
 * Works identically on plain JS objects and Vue 3 reactive Proxies.
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class UndoRedoStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  private cloneState(state: T): T {
    return deepClone(state);
  }

  public record(previousState: T): void {
    this.past.push(this.cloneState(previousState));
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.future = [];
  }

  public undo(currentState: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.cloneState(currentState));
    return this.cloneState(prev);
  }

  public redo(currentState: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.cloneState(currentState));
    return this.cloneState(next);
  }

  public get canUndo(): boolean {
    return this.past.length > 0;
  }

  public get canRedo(): boolean {
    return this.future.length > 0;
  }

  public clear(): void {
    this.past = [];
    this.future = [];
  }
}
