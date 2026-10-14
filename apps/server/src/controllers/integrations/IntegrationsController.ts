import type { Request, Response } from "express";
import { z } from "zod";
import { canEnterSurface } from "../../config/roles.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { IntegrationSettingService } from "../../services/integrations/IntegrationSettingService.js";

const credentialsBody = z
  .object({
    version: z.number().int().min(0),
    values: z.record(z.string(), z.string().max(4096).nullable()),
  })
  .strict();

export class IntegrationsController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const [rows, session] = await Promise.all([
      IntegrationSettingService.rows(),
      AuthService.getSession(req),
    ]);
    if (session?.user && canEnterSurface(session.user.role, "admin")) {
      okOne(res, rows);
      return;
    }
    okOne(res, await IntegrationSettingService.publicPayload());
  });

  readonly setEnabled = catchAsync(async (req: Request, res: Response) => {
    const key = IntegrationSettingService.assertKey(String(req.params.key));
    const input = parseBody(z.object({ enabled: z.boolean() }), req);
    okOne(
      res,
      await IntegrationSettingService.setEnabled(
        AuthService.sessionOf(req).user.id,
        key,
        input.enabled,
      ),
    );
  });

  readonly saveCredentials = catchAsync(async (req: Request, res: Response) => {
    const key = IntegrationSettingService.assertKey(String(req.params.key));
    const input = parseBody(credentialsBody, req);
    okOne(
      res,
      await IntegrationSettingService.saveCredentials({
        actorId: AuthService.sessionOf(req).user.id,
        key,
        version: input.version,
        values: input.values,
      }),
    );
  });

  readonly resetCredentials = catchAsync(async (req: Request, res: Response) => {
    const key = IntegrationSettingService.assertKey(String(req.params.key));
    okOne(
      res,
      await IntegrationSettingService.resetCredentials(
        AuthService.sessionOf(req).user.id,
        key,
      ),
    );
  });

  readonly exportCredentials = catchAsync(
    async (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "no-store");
      okOne(
        res,
        await IntegrationSettingService.exportEnv(
          AuthService.sessionOf(req).user.id,
        ),
      );
    },
  );
}

export const integrationsController = new IntegrationsController();
