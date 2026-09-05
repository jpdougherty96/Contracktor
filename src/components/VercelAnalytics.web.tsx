import { Analytics } from '@vercel/analytics/react';

export function VercelAnalytics() {
  return <Analytics beforeSend={redactAnalyticsUrl} />;
}

function redactAnalyticsUrl<T extends { url: string }>(event: T): T {
  try {
    const url = new URL(event.url);
    url.pathname = url.pathname.replace(/\/jobs\/[^/]+/g, '/jobs/[jobId]');
    url.search = '';
    url.hash = '';

    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}
