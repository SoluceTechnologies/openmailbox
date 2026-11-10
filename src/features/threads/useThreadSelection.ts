import { useCallback, useState } from 'react';
import type { ThreadSummary } from '@openmailbox/mail-core';

export function useThreadSelection() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Map<string, ThreadSummary>>(() => new Map());

  const toggle = useCallback((thread: ThreadSummary) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(thread.key)) next.delete(thread.key);
      else next.set(thread.key, thread);
      return next;
    });
  }, []);

  const start = useCallback(() => {
    setSelected(new Map());
    setActive(true);
  }, []);

  const end = useCallback(() => {
    setActive(false);
    setSelected(new Map());
  }, []);

  const toggleAll = useCallback((threads: ThreadSummary[]) => {
    setSelected((current) =>
      current.size === threads.length ? new Map() : new Map(threads.map((thread) => [thread.key, thread])),
    );
  }, []);

  return { active, selected, toggle, toggleAll, start, end };
}
