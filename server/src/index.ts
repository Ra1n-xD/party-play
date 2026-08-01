import express from "express";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync } from "fs";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { CONFIG } from "./config.js";
import { registerHandlers } from "./socketHandlers.js";
import { createNamespaceConnectionLimiter } from "./namespaceConnectionLimiter.js";

const app = express();

// Production exposes Node only through the loopback nginx proxy.
app.set("trust proxy", "loopback");

// Security headers with CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "wss:"],
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
const allowedOriginSet = new Set(allowedOrigins);

app.use(cors({ origin: allowedOrigins }));

// Payload size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ limit: "10kb", extended: true }));

// HTTPS support: set SSL_CERT and SSL_KEY env vars to enable
const sslCert = process.env.SSL_CERT;
const sslKey = process.env.SSL_KEY;
const useHttps = sslCert && sslKey;

const httpServer = useHttps
  ? createHttpsServer({ cert: readFileSync(sslCert), key: readFileSync(sslKey) }, app)
  : createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin;
    callback(null, !origin || allowedOriginSet.has(origin));
  },
  // Socket.IO payload size limit (1MB default -> 100KB)
  maxHttpBufferSize: 100_000,
});
let ready = false;
let shuttingDown = false;

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "PartyPlay Server" });
});

app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

app.get("/readyz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "stopping" });
});

// Per-IP connection limiting
const ipConnectionCounts = new Map<string, number>();
const connectionLimiter = createNamespaceConnectionLimiter(
  CONFIG.MAX_CONNECTIONS_PER_IP,
  ipConnectionCounts,
);
io.use(connectionLimiter);

registerHandlers(io);

const bindHost =
  process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

httpServer.listen(CONFIG.PORT, bindHost, () => {
  ready = true;
  const proto = useHttps ? "https" : "http";
  console.log(`PartyPlay server running on ${proto}://${bindHost}:${CONFIG.PORT}`);
  if (!useHttps) {
    console.log(
      "WARNING: Running without HTTPS. Set SSL_CERT and SSL_KEY env vars for production.",
    );
  }
});

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  console.log(`Received ${signal}, stopping PartyPlay server...`);

  const forceExitTimer = setTimeout(() => {
    console.error("PartyPlay server did not stop within 10 seconds");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  void io.close((error) => {
    clearTimeout(forceExitTimer);
    if (error) {
      console.error("Failed to stop PartyPlay server cleanly", error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
