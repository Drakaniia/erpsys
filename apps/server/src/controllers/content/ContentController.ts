import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import {
  okList,
  okOne,
  parseBody,
  parsePagination,
  parseQuery,
} from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { ChatbotKnowledgeService } from "../../services/content/ChatbotKnowledgeService.js";
import { ProfilingFormService } from "../../services/content/ProfilingFormService.js";
import { SignupOptionsService } from "../../services/content/SignupOptionsService.js";
import { SocialLinkService } from "../../services/content/SocialLinkService.js";

const idParams = z.object({ id: z.string().min(1) });
const linkBody = {
  name: z.string().trim().min(1).max(120),
  url: z.string().url().max(1000),
};

export class ContentController {
  readonly getProfilingForm = catchAsync(
    async (_req: Request, res: Response) => {
      okOne(res, await ProfilingFormService.read());
    },
  );

  readonly createProfilingForm = catchAsync(
    async (req: Request, res: Response) => {
      const input = parseBody(
        z.object({ title: z.string().trim().min(1).max(200) }),
        req,
      );
      const session = AuthService.sessionOf(req);
      okOne(
        res,
        await ProfilingFormService.create(
          session.user,
          input.title,
          session.user.role === "ADMIN",
        ),
        201,
      );
    },
  );

  readonly removeProfilingForm = catchAsync(
    async (req: Request, res: Response) => {
      const session = AuthService.sessionOf(req);
      okOne(
        res,
        await ProfilingFormService.remove(
          session.user.id,
          session.user.role === "ADMIN",
        ),
      );
    },
  );

  readonly listLinks = catchAsync(async (req: Request, res: Response) => {
    const links = await SocialLinkService.list();
    const { page, pageSize } = parsePagination(req);
    okList(res, links, page, pageSize, links.length);
  });

  readonly saveLink = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ id: z.string().optional(), ...linkBody }),
      req,
    );
    okOne(res, await SocialLinkService.save(input), input.id ? 200 : 201);
  });

  readonly updateLink = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    okOne(
      res,
      await SocialLinkService.update(
        params.id,
        parseBody(z.object(linkBody), req),
      ),
    );
  });

  readonly removeLink = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    await SocialLinkService.remove(params.id);
    okOne(res, { ok: true });
  });

  readonly reorderLinks = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ orderedIds: z.array(z.string().min(1)) }),
      req,
    );
    await SocialLinkService.reorder(input.orderedIds);
    okOne(res, { ok: true });
  });

  readonly getKnowledge = catchAsync(async (_req: Request, res: Response) => {
    okOne(res, await ChatbotKnowledgeService.read());
  });

  readonly saveKnowledge = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ content: z.string().max(200_000) }),
      req,
    );
    okOne(
      res,
      await ChatbotKnowledgeService.write(
        AuthService.sessionOf(req).user.id,
        input.content,
      ),
    );
  });

  readonly signupOptions = catchAsync(async (_req: Request, res: Response) => {
    okOne(res, await SignupOptionsService.get());
  });
}

export const contentController = new ContentController();
