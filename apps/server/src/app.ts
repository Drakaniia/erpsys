import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, webOrigins } from "./lib/platform/env.js";
import { requestLogMiddleware } from "./lib/platform/request-log.js";
import { restRateLimit } from "./lib/platform/rate-limit.js";
import { auditTrail } from "./middleware/audit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler, registerApiPrefixes } from "./middleware/notFound.js";
import { spaFallback } from "./middleware/spaFallback.js";
import { timestampOrdering } from "./middleware/timestamp.js";
import { authRouter } from "./routes/auth/index.js";
import { chatRouter } from "./routes/chat/index.js";
import { v1Router } from "./routes/index.js";
import { systemRouter } from "./routes/system/index.js";

export function buildApp(): Express {
  const app = express();
  app.set("trust proxy", 1);

  const allowedOrigins = webOrigins();
  if (allowedOrigins.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (typeof origin === "string" && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "content-type,authorization,cf-turnstile-response",
        );
      }
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  app.use(requestLogMiddleware);

  app.use(systemRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", chatRouter);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", restRateLimit);

  registerApiPrefixes(["/api"]);
  app.use("/api/v1", timestampOrdering, auditTrail, v1Router);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (env.SERVE_WEB) {
    const webDist = path.resolve(__dirname, "../../web/dist");
    app.use(
      "/assets",
      express.static(path.join(webDist, "assets"), {
        index: false,
        maxAge: "1y",
        immutable: true,
      }),
    );
    app.use(express.static(webDist, { index: false, maxAge: 0 }));
  }

  app.use(notFoundHandler);
  if (env.SERVE_WEB) {
    app.get("/{*splat}", spaFallback);
  } else {
    app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  }

  app.use(errorHandler);
  return app;
}
