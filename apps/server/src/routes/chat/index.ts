import express, { Router } from "express";
import { chatController } from "../../controllers/chat/ChatController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api` — the chat stream, mounted ahead of the global JSON parser: its body
 * is capped at 100kb and the SSE response must not be buffered.
 */
export const chatRouter = Router();

/**
 * `POST /api/chat/stream`
 * Access: session + student surface.
 * Use: send one chat turn — JSON body, 100kb cap.
 * Returns: the SSE stream itself; no `{ data }` envelope.
 */
chatRouter.post(
  "/chat/stream",
  express.json({ limit: "100kb" }),
  requireSession,
  requireSurface("student"),
  chatController.stream,
);
