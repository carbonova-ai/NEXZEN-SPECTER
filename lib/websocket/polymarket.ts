export type PolymarketWSCallback = (tokenId: string, price: number) => void;

export function createPolymarketStream(
  onPriceUpdate: PolymarketWSCallback,
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
) {
  let ws: WebSocket | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let isIntentionalClose = false;
  const subscriptions = new Set<string>();

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    isIntentionalClose = false;
    onStatusChange('connecting');

    try {
      ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    } catch {
      onStatusChange('error');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectAttempts = 0;
      onStatusChange('connected');

      // Re-subscribe to tracked markets
      if (subscriptions.size > 0) {
        subscribe([...subscriptions]);
      }

      // Keep-alive ping every 10 seconds
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send('PING');
        }
      }, 10_000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'PONG') return;

      try {
        const data = JSON.parse(event.data);
        // Handle price update messages
        if (data.market && data.price !== undefined) {
          onPriceUpdate(data.market, parseFloat(data.price));
        }
        // Handle array format
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.market && item.price !== undefined) {
              onPriceUpdate(item.market, parseFloat(item.price));
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      onStatusChange('error');
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      if (isIntentionalClose) {
        onStatusChange('disconnected');
        return;
      }
      onStatusChange('disconnected');
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    reconnectAttempts++;
    const delay = Math.min(500 * Math.pow(1.5, reconnectAttempts), 15_000);
    reconnectTimeout = setTimeout(connect, delay);
  }

  function subscribe(marketIds: string[]) {
    for (const id of marketIds) subscriptions.add(id);

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: marketIds.map(id => ({ market_id: id })),
      }));
    }
  }

  function disconnect() {
    isIntentionalClose = true;
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  return { connect, subscribe, disconnect };
}
