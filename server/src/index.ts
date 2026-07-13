import express from "express";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync } from "fs";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { CONFIG } from "./config.js";
import { registerHandlers } from "./socketHandlers.js";
import { registerWeddingHandlers } from "./wedding/socketHandlers.js";
import { registerQuestionsHandlers } from "./questions/socketHandlers.js";
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
  // Socket.IO payload size limit (1MB default -> 100KB)
  maxHttpBufferSize: 100_000,
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "PartyPlay Server" });
});

// Per-IP connection limiting
const ipConnectionCounts = new Map<string, number>();
const connectionLimiter = createNamespaceConnectionLimiter(
  CONFIG.MAX_CONNECTIONS_PER_IP,
  ipConnectionCounts,
);
const weddingNamespace = io.of("/wedding");
const questionsNamespace = io.of("/questions");
io.use(connectionLimiter);
questionsNamespace.use(connectionLimiter);

registerHandlers(io);
registerWeddingHandlers(weddingNamespace);
registerQuestionsHandlers(questionsNamespace);

const bindHost =
  process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

httpServer.listen(CONFIG.PORT, bindHost, () => {
  const proto = useHttps ? "https" : "http";
  console.log(`PartyPlay server running on ${proto}://${bindHost}:${CONFIG.PORT}`);
  if (!useHttps) {
    console.log(
      "WARNING: Running without HTTPS. Set SSL_CERT and SSL_KEY env vars for production.",
    );
  }
});
