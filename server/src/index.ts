import express from "express";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync } from "fs";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { CONFIG } from "./config.js";
import { registerHandlers } from "./socketHandlers.js";

const app = express();

// Trust reverse proxy (Caddy/Nginx) — correct client IP in req.ip
app.set("trust proxy", 1);

// Security headers with CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Prevent clickjacking
    frameguard: { action: "deny" },
  }),
);

// CORS — restricted origins
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:5173", "http://localhost:3001"];

app.use(cors({ origin: allowedOrigins }));

// Payload size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ limit: "10kb", extended: true }));

// HTTPS support: set SSL_CERT and SSL_KEY env vars to enable
const sslCert = process.env.SSL_CERT;
const sslKey = process.env.SSL_KEY;
const useHttps = sslCert && sslKey;

const httpServer = useHttps
  ? createHttpsServer(
      { cert: readFileSync(sslCert), key: readFileSync(sslKey) },
      app,
    )
  : createServer(app);

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
  const proto = useHttps ? "https" : "http";
  console.log(`PartyPlay server running on ${proto}://0.0.0.0:${CONFIG.PORT}`);
  if (!useHttps) {
    console.log("WARNING: Running without HTTPS. Set SSL_CERT and SSL_KEY env vars for production.");
  }
});
