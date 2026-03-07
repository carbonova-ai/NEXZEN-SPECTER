const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

interface RequestEntry {
  timestamp: number;
}

const requests: RequestEntry[] = [];

export function checkRateLimit(): { allowed: boolean; remaining: number } {
  const now = Date.now();
  // Prune old entries
  while (requests.length > 0 && now - requests[0].timestamp > WINDOW_MS) {
    requests.shift();
  }

  if (requests.length >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  requests.push({ timestamp: now });
  return { allowed: true, remaining: MAX_REQUESTS - requests.length };
}
