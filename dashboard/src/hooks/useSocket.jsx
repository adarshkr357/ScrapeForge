import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socketInstance) {
      const token = localStorage.getItem('sf_token');
      socketInstance = io(window.location.origin, {
        path: '/socket.io/',
        auth: { token },
        transports: ['websocket', 'polling'],
      });
    }

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);

    if (socketInstance.connected) setConnected(true);

    return () => {
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
    };
  }, []);

  const subscribe = useCallback((event, callback) => {
    socketInstance?.on(event, callback);
    return () => socketInstance?.off(event, callback);
  }, []);

  const emit = useCallback((event, data) => {
    socketInstance?.emit(event, data);
  }, []);

  return { connected, subscribe, emit, socket: socketInstance };
}
