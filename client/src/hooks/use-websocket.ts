import { useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';

interface WebSocketMessage {
  type: string;
  data: any;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const connect = () => {
      if (!isMountedRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      
      console.log('[WebSocket] Attempting to connect to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully!');
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message.type, 'Data:', message.data);

          switch (message.type) {
            case 'table_created':
            case 'table_updated':
              console.log('[WebSocket] Invalidating tables queries');
              queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
              break;
            case 'order_created':
            case 'order_updated':
            case 'order_completed':
            case 'order_paid':
              console.log('[WebSocket] Invalidating order queries for order:', message.data?.id);
              queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
              queryClient.invalidateQueries({ queryKey: ['/api/orders/active'] });
              queryClient.invalidateQueries({ queryKey: ['/api/orders/completed'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
              queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  query.queryKey[0] === '/api/orders' &&
                  query.queryKey[2] === 'items'
              });
              if (message.data?.id) {
                queryClient.invalidateQueries({ 
                  predicate: (query) => 
                    Array.isArray(query.queryKey) && 
                    query.queryKey[0] === '/api/orders' && 
                    query.queryKey[1] === message.data.id 
                });
              }
              break;
            case 'order_item_added':
            case 'order_item_updated':
            case 'order_item_deleted':
              console.log('[WebSocket] Invalidating order items queries for orderId:', message.data?.orderId);
              queryClient.invalidateQueries({ queryKey: ['/api/orders/active'] });
              queryClient.invalidateQueries({ queryKey: ['/api/orders/completed'] });
              queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
              queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  query.queryKey[0] === '/api/orders' &&
                  query.queryKey[2] === 'items'
              });
              if (message.data?.orderId) {
                queryClient.invalidateQueries({ 
                  predicate: (query) => 
                    Array.isArray(query.queryKey) && 
                    query.queryKey[0] === '/api/orders' && 
                    query.queryKey[1] === message.data.orderId 
                });
              }
              break;
            case 'menu_created':
            case 'menu_updated':
            case 'menu_synced':
              queryClient.invalidateQueries({ queryKey: ['/api/menu'] });
              queryClient.invalidateQueries({ queryKey: ['/api/menu/categories'] });
              break;
            case 'floor_created':
            case 'floor_updated':
            case 'floor_deleted':
              queryClient.invalidateQueries({ queryKey: ['/api/floors'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
              break;
            case 'invoice_created':
            case 'invoice_updated':
            case 'invoice_deleted':
              queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
              break;
            case 'inventory_updated':
              queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
              break;
            case 'kot_created':
              queryClient.invalidateQueries({ queryKey: ['/api/orders/active'] });
              queryClient.invalidateQueries({ queryKey: ['/api/orders/completed'] });
              break;
            default:
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        if (isMountedRef.current) {
          console.log('[WebSocket] Reconnecting in 3s...');
          reconnectTimeoutRef.current = setTimeout(connect, 1000);
        }
      };
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return wsRef.current;
}
