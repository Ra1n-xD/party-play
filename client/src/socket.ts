import { io, Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '../../shared/types';

const URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

export const socket: Socket<ServerEvents, ClientEvents> = io(URL, {
  autoConnect: false,
});
