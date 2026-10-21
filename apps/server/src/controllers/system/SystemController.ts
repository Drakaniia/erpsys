import type { RequestHandler } from "express";
import { metricsHandler } from "../../lib/platform/metrics.js";
import { openapiDocument } from "../../lib/platform/openapi.js";
import { readinessHandler } from "../../lib/platform/readiness.js";
import { subscribeToUser, type LiveEvent } from "../../lib/platform/sse.js";
import { AuthService } from "../../services/auth/AuthService.js";

const HEARTBEAT_MS = 25_000;

const DOCS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ERPSYS API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });</script>
</body></html>`;

export class SystemController {
  readonly health: RequestHandler = (_req, res) => {
    res.json({ ok: true });
  };

  readonly ready: RequestHandler = readinessHandler;
  readonly metrics: RequestHandler = metricsHandler;

  readonly openapi: RequestHandler = (_req, res) => {
    res.json(openapiDocument);
  };

  readonly docs: RequestHandler = (_req, res) => {
    res.type("html").send(DOCS_HTML);
  };

  readonly events: RequestHandler = async (req, res) => {
    const session = await AuthService.getSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 3000\n\n");

    const heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {}
    }, HEARTBEAT_MS);

    const unsubscribe = subscribeToUser(session.user.id, (event: LiveEvent) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {}
    });

    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
}

export const systemController = new SystemController();
