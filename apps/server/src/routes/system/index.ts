import { Router } from "express";
import { systemController } from "../../controllers/system/SystemController.js";

/**
 * Root — health, readiness, metrics, live events, OpenAPI and docs; mounted
 * before the JSON parsers so the SSE stream is never buffered.
 */
export const systemRouter = Router();

/**
 * `GET /api/health`
 * Access: public.
 * Use: liveness probe; never touches Mongo.
 * Returns: `{ ok: true }`.
 */
systemRouter.get("/api/health", systemController.health);

/**
 * `GET /api/ready`
 * Access: public.
 * Use: readiness probe behind a Mongo ping.
 * Returns: `{ ok }` at 200, `503` when not ready.
 */
systemRouter.get("/api/ready", systemController.ready);

/**
 * `GET /api/metrics`
 * Access: public.
 * Use: Prometheus scrape endpoint.
 * Returns: text exposition of the counters.
 */
systemRouter.get("/api/metrics", systemController.metrics);

/**
 * `GET /api/events`
 * Access: session.
 * Use: live server events for this user; 25s heartbeat keeps the stream open.
 * Returns: SSE stream, `401` without a session.
 */
systemRouter.get("/api/events", systemController.events);

/**
 * `GET /openapi.json`
 * Access: public.
 * Use: machine-readable description of this API.
 * Returns: the OpenAPI document.
 */
systemRouter.get("/openapi.json", systemController.openapi);

/**
 * `GET /docs`
 * Access: public.
 * Use: Swagger UI over `/openapi.json` (also served at `/docs/`).
 * Returns: HTML page.
 */
systemRouter.get(["/docs", "/docs/"], systemController.docs);
