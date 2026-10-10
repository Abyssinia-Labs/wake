// What tells an open `pending` stream to look again: a change to one
// agent's summonses. In one process this is enough; across instances the
// stream also looks again on a timer (handler.ts), so a change another
// instance made shows within that time.

export type Changes = {
  publish(agent: string): void;
  /** Answers how to stop listening. */
  subscribe(agent: string, listener: () => void): () => void;
};

export function localChanges(): Changes {
  const listeners = new Map<string, Set<() => void>>();
  return {
    publish(agent) {
      for (const listener of listeners.get(agent) ?? []) listener();
    },
    subscribe(agent, listener) {
      const set = listeners.get(agent) ?? new Set();
      set.add(listener);
      listeners.set(agent, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(agent);
      };
    },
  };
}
