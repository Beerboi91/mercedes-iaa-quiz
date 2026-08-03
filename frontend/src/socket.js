import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

// Connect to socket backend server
export const socket = io(BACKEND_URL, {
  autoConnect: true
});
