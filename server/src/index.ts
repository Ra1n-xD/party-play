import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { CONFIG } from './config.js';
import { registerHandlers } from './socketHandlers.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Bunker Game Server' });
});

registerHandlers(io);

httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`Bunker server running on http://0.0.0.0:${CONFIG.PORT}`);
});
