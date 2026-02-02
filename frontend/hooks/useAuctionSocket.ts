'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: 'auction_update' | 'player_sold' | 'undo' | 'ping';
  data?: any;
  auction_id?: number;
}

export function useAuctionSocket(projectId: number) {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    
    const token = localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `ws://localhost:8000/auction/ws/${projectId}?token=${token}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
    };

    ws.current.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'player_sold':
        case 'undo':
          queryClient.invalidateQueries({ queryKey: ['auction-data', projectId] });
          break;
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [projectId, queryClient]);

  return { isConnected };
}