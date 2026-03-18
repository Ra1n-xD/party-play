import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { CONFIG } from "./config.js";
import { registerHandlers } from "./socketHandlers.js";

const app = express();

// Trust reverse proxy (Caddy/Nginx) — correct client IP in req.ip
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// CORS — restricted origins
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:5173", "http://localhost:3001"];

app.use(cors({ origin: allowedOrigins }));

// Payload size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ limit: "10kb", extended: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  // Socket.IO payload size limit (1MB default -> 100KB)
  maxHttpBufferSize: 100_000,
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "PartyPlay Server" });
});

// Per-IP connection limiting
const ipConnectionCounts = new Map<string, number>();

io.use((socket, next) => {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null)
    || socket.handshake.address;

  const count = ipConnectionCounts.get(ip) || 0;
  if (count >= CONFIG.MAX_CONNECTIONS_PER_IP) {
    return next(new Error("Too many connections from this IP"));
  }

  ipConnectionCounts.set(ip, count + 1);
  socket.on("disconnect", () => {
    const c = ipConnectionCounts.get(ip) || 1;
    if (c <= 1) ipConnectionCounts.delete(ip);
    else ipConnectionCounts.set(ip, c - 1);
  });

  next();
});

registerHandlers(io);

httpServer.listen(CONFIG.PORT, "0.0.0.0", () => {
  console.log(`PartyPlay server running on http://0.0.0.0:${CONFIG.PORT}`);
});
