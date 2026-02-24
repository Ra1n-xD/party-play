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
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Bunker Game Server' });
});

registerHandlers(io);

httpServer.listen(CONFIG.PORT, () => {
  console.log(`🏠 Bunker server running on http://localhost:${CONFIG.PORT}`);
});
