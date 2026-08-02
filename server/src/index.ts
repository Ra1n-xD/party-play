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
import { isDeploymentDraining, setDeploymentDraining } from "./platform/deploymentState.js";
import { getAllRooms } from "./platform/roomManager.js";

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

const isProduction = process.env.NODE_ENV === "production";

function readAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (isProduction && !rawOrigins) {
    throw new Error("CORS_ORIGINS is required in production");
  }
  const candidates = rawOrigins
    ? rawOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ["http://localhost:5173", "http://localhost:3001"];
  if (candidates.length === 0) throw new Error("CORS_ORIGINS must not be empty");

  return candidates.map((candidate) => {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin !== candidate
    ) {
      throw new Error(`Invalid CORS origin: ${candidate}`);
    }
    return parsed.origin;
  });
}

// CORS — restricted origins
const allowedOrigins = readAllowedOrigins(process.env.CORS_ORIGINS);
const allowedOriginSet = new Set(allowedOrigins);

app.use(cors({ origin: allowedOrigins }));

// Payload size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ limit: "10kb", extended: true }));

// HTTPS support: set SSL_CERT and SSL_KEY env vars to enable
const sslCert = process.env.SSL_CERT;
const sslKey = process.env.SSL_KEY;
if (Boolean(sslCert) !== Boolean(sslKey)) {
  throw new Error("SSL_CERT and SSL_KEY must be configured together");
}
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
  const acceptingTraffic = ready && !shuttingDown && !isDeploymentDraining();
  res.set("Cache-Control", "no-store");
  res.status(acceptingTraffic ? 200 : 503).json({
    status: acceptingTraffic ? "ready" : isDeploymentDraining() ? "draining" : "stopping",
  });
});

function isLoopbackRequest(remoteAddress: string | undefined): boolean {
  return (
    remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1"
  );
}

app.get("/deployz", (req, res) => {
  if (!isLoopbackRequest(req.socket.remoteAddress)) {
    res.sendStatus(404);
    return;
  }
  const retainedRooms = getAllRooms().size;
  const safe = ready && !shuttingDown && isDeploymentDraining() && retainedRooms === 0;
  res.set("Cache-Control", "no-store");
  res.status(safe ? 200 : 409).json({
    status: safe ? "drained" : isDeploymentDraining() ? "busy" : "open",
    retainedRooms,
  });
});

app.post("/deployz/drain", (req, res) => {
  if (!isLoopbackRequest(req.socket.remoteAddress)) {
    res.sendStatus(404);
    return;
  }
  const retainedRooms = getAllRooms().size;
  if (!ready || shuttingDown || retainedRooms > 0) {
    res.set("Cache-Control", "no-store");
    res.status(409).json({ status: "busy", retainedRooms });
    return;
  }
  setDeploymentDraining(true);
  res.set("Cache-Control", "no-store");
  res.json({ status: "drained", retainedRooms: 0 });
});

app.post("/deployz/resume", (req, res) => {
  if (!isLoopbackRequest(req.socket.remoteAddress)) {
    res.sendStatus(404);
    return;
  }
  setDeploymentDraining(false);
  res.set("Cache-Control", "no-store");
  res.json({ status: "open" });
});

// Per-IP connection limiting
const ipConnectionCounts = new Map<string, number>();
const connectionLimiter = createNamespaceConnectionLimiter(
  CONFIG.MAX_CONNECTIONS_PER_IP,
  ipConnectionCounts,
);
io.use(connectionLimiter);

registerHandlers(io);

const bindHost = process.env.HOST || (isProduction ? "127.0.0.1" : "0.0.0.0");
if (isProduction && bindHost !== "127.0.0.1" && bindHost !== "::1") {
  throw new Error("Production HOST must be a loopback address");
}

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
