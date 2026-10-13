import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import {
  LEVER_ROLES,
  UserAdminService,
} from "../../services/users/UserAdminService.js";
import { UserDeletionService } from "../../services/users/UserDeletionService.js";
import {
  UserListService,
  userListQuery,
} from "../../services/users/UserListService.js";

const userIdParams = z.object({ userId: z.string().min(1) });
const leverRole = z.enum(LEVER_ROLES);

export class UsersController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(userListQuery, req);
    const { items, total } = await UserListService.list(input);
    okList(res, items, input.page, input.pageSize, total);
  });

  readonly bulkRole = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({
        userIds: z.array(z.string().min(1)).max(500),
        role: leverRole,
      }),
      req,
    );
    okOne(
      res,
      await UserAdminService.setRoleBulk(
        AuthService.sessionOf(req).user.id,
        input.userIds,
        input.role,
      ),
    );
  });

  readonly setRole = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(userIdParams, req);
    const input = parseBody(z.object({ role: leverRole }), req);
    okOne(
      res,
      await UserAdminService.setRole(
        AuthService.sessionOf(req).user.id,
        params.userId,
        input.role,
      ),
    );
  });

  readonly bulkDelete = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ userIds: z.array(z.string().min(1)).max(500) }),
      req,
    );
    okOne(
      res,
      await UserDeletionService.deleteBulk(
        AuthService.sessionOf(req).user.id,
        input.userIds,
      ),
    );
  });

  readonly purge = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(userIdParams, req);
    okOne(
      res,
      await UserDeletionService.purge(
        AuthService.sessionOf(req).user.id,
        params.userId,
      ),
    );
  });

  readonly resetPassword = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(userIdParams, req);
    const input = parseBody(
      z.object({ newPassword: z.string().min(8).max(128) }),
      req,
    );
    okOne(
      res,
      await UserAdminService.resetPassword(
        AuthService.sessionOf(req).user.id,
        params.userId,
        input.newPassword,
      ),
    );
  });
}

export const usersController = new UsersController();
