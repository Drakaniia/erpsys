import { Router } from "express";
import { academicYearsRouter } from "./academic-years/index.js";
import { advisersRouter } from "./advisers/index.js";
import { auditLogsRouter } from "./audit-logs/index.js";
import { calendarRouter } from "./calendar/index.js";
import { contentRouter } from "./content/index.js";
import { departmentsRouter } from "./departments/index.js";
import { enrollmentsRouter } from "./enrollments/index.js";
import { evidenceRouter } from "./evidence/index.js";
import { integrationsRouter } from "./integrations/index.js";
import { meRouter } from "./me/index.js";
import { queueSharesRouter } from "./queue-shares/index.js";
import { queuesRouter } from "./queues/index.js";
import { reportsRouter } from "./reports/index.js";
import { requirementsRouter } from "./requirements/index.js";
import { schedulesRouter } from "./schedules/index.js";
import { storageRouter } from "./storage/index.js";
import { studentsRouter } from "./students/index.js";
import { submissionsRouter } from "./submissions/index.js";
import { transfersRouter } from "./transfers/index.js";
import { usersRouter } from "./users/index.js";

/**
 * `/api/v1` — every resource router mounts here exactly once, in this order.
 */
export const v1Router = Router();

v1Router.use(academicYearsRouter);
v1Router.use(requirementsRouter);
v1Router.use(reportsRouter);
v1Router.use(contentRouter);
v1Router.use(meRouter);
v1Router.use(studentsRouter);
v1Router.use(submissionsRouter);
v1Router.use(transfersRouter);
v1Router.use(enrollmentsRouter);
v1Router.use(departmentsRouter);
v1Router.use(advisersRouter);
v1Router.use(schedulesRouter);
v1Router.use(calendarRouter);
v1Router.use(queuesRouter);
v1Router.use(queueSharesRouter);
v1Router.use(evidenceRouter);
v1Router.use(storageRouter);
v1Router.use(integrationsRouter);
v1Router.use(usersRouter);
v1Router.use(auditLogsRouter);
