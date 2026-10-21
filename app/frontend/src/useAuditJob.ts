import { useEffect, useState } from 'react';
import type { AuditJob } from './types';

export function useAuditJob(jobId: string | null): AuditJob | null {
  const [job, setJob] = useState<AuditJob | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return undefined;
    }
    let active = true;
    let timer: number | undefined;

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/audits/${encodeURIComponent(jobId)}`);
        if (response.status === 404) {
          if (active) setJob(null);
          return;
        }
        if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
        const next = await response.json() as AuditJob;
        if (!active) return;
        setJob(next);
        if (next.status === 'QUEUED' || next.status === 'RUNNING') {
          timer = window.setTimeout(() => void poll(), 700);
        }
      } catch {
        if (active) timer = window.setTimeout(() => void poll(), 1500);
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId]);

  return job;
}
