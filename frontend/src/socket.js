import { io } from 'socket.io-client';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (isLocalhost ? 'http://localhost:3001' : 'https://mercedes-iaa-quiz-backend.onrender.com');

// Connect to socket backend server
export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['polling', 'websocket']
});
