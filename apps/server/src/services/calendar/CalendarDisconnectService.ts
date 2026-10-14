import {
  accessToken,
  deleteCalendar,
  forgetAccessToken,
  revokeToken,
} from "../../lib/google/calendar.js";
import { openToken } from "../../lib/platform/token-crypto.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { CalendarConnectionModel } from "../../models/CalendarConnectionModel.js";

export class CalendarDisconnectService {
  static async disconnect(userId: string, audit = false): Promise<void> {
    const conn = await CalendarConnectionModel.findByUser(userId);
    if (!conn) return;
    if (conn.refreshTokenEnc) {
      try {
        const refresh = openToken(conn.refreshTokenEnc);
        if (conn.googleCalendarId) {
          await deleteCalendar(
            userId,
            await accessToken(userId, refresh),
            conn.googleCalendarId,
          ).catch(() => undefined);
        }
        await revokeToken(refresh).catch(() => undefined);
      } catch {}
    }
    forgetAccessToken(userId);
    await CalendarConnectionModel.remove(userId);
    if (audit) {
      await AdminActionLogModel.log(
        userId,
        "Disconnected Google Calendar",
        `User:${userId}`,
      );
    }
  }

  static async removeAll(userId: string): Promise<void> {
    await CalendarDisconnectService.disconnect(userId);
    await AvailabilityWindowModel.deleteForAdviser(userId);
  }
}
