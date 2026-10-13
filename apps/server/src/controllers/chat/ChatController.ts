import type { Request, Response } from "express";
import { ChatStreamService } from "../../services/chat/ChatStreamService.js";

export class ChatController {
  readonly stream = (req: Request, res: Response): Promise<void> =>
    ChatStreamService.stream(req, res);
}

export const chatController = new ChatController();
