import { io } from 'socket.io-client';
import { SERVER_URL } from './config';

const socket = io(SERVER_URL || undefined, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export default socket;
