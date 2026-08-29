import { useState, useEffect, useRef } from 'react';
import type { SSEPayload } from '@home-automation/shared-types';

/**
 * SSE hook — connects to /sse endpoint via EventSource, parses data messages
 * into SSEPayload, and auto-reconnects on connection loss (EventSource built-in).
 *
 * Requirements: 3.1, 8.5
 */
export function useSSE(url: string = '/sse'): SSEPayload | null {
  const [data, setData] = useState<SSEPayload | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      try {
        const payload: SSEPayload = JSON.parse(event.data);
        setData(payload);
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      // EventSource automatically reconnects — no manual handling needed.
      // Connection state resets on reconnect, data updates resume.
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [url]);

  return data;
}
