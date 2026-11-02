import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";
import { HashRedirect, RequireApp, RequireNoAuth, RootGate } from "./guards";
import { AppLayout, AuthLayout } from "./layouts";
import PageLoader from "../components/ui/PageLoader";
import {
  CompleteProfilePage,
  LandingPage,
  LoginPage,
  NotFoundPage,
  RegisterPage,
} from "./pages";
import {
  AuthErrorPage,
  ConnectedAccountsPage,
  CopyCodePage,
  ForgotPasswordPage,
  LoadingPage,
  ResetPasswordPage,
} from "./auth-pages";

/**
 * Consoles are lazy so the signed-out entry point never downloads them. The
 * loaders are duplicated in `$lib/perf/preload-surface.ts`; keep the two in
 * sync (`SURFACE_LOADERS` is what the launch path warms).
 */
const StudentPage = lazy(() =>
  import("./student-page").then((m) => ({ default: m.StudentPage })),
);
const QueuePage = lazy(() =>
  import("./queue-page").then((m) => ({ default: m.QueuePage })),
);
const OfficerPage = lazy(() =>
  import("./officer-page").then((m) => ({ default: m.OfficerPage })),
);
const InstructorPage = lazy(() =>
  import("./instructor-page").then((m) => ({ default: m.InstructorPage })),
);
const AdminPage = lazy(() =>
  import("./admin-page").then((m) => ({ default: m.AdminPage })),
);
const DocsPage = lazy(() =>
  import("./docs-page").then((m) => ({ default: m.DocsPage })),
);

export const router = createBrowserRouter([
  {
    element: <HashRedirect />,
    children: [
      {
        element: <RootGate />,
        children: [
          { path: "/", element: <LandingPage /> },
          {
            path: "/docs",
            element: (
              <Suspense fallback={<PageLoader label="Loading documentation" />}>
                <DocsPage />
              </Suspense>
            ),
          },
          {
            element: (
              <RequireNoAuth>
                <AuthLayout />
              </RequireNoAuth>
            ),
            children: [
              { path: "/login", element: <LoginPage /> },
              { path: "/login/register", element: <RegisterPage /> },
              {
                path: "/login/forgot-password",
                element: <ForgotPasswordPage />,
              },
              {
                path: "/login/reset-password",
                element: <ResetPasswordPage />,
              },
              { path: "/loading", element: <LoadingPage /> },
              { path: "/auth/error", element: <AuthErrorPage /> },
            ],
          },
          {
            element: <AuthLayout />,
            children: [
              { path: "/login/copy-code", element: <CopyCodePage /> },
              {
                path: "/settings/accounts",
                element: <ConnectedAccountsPage />,
              },
              {
                path: "/complete-profile",
                element: <CompleteProfilePage />,
              },
            ],
          },
          {
            element: (
              <RequireApp>
                <AppLayout />
              </RequireApp>
            ),
            children: [
              { path: "/student", element: <StudentPage /> },
              { path: "/queue", element: <QueuePage /> },
              { path: "/officer", element: <OfficerPage /> },
              { path: "/instructor", element: <InstructorPage /> },
              { path: "/admin", element: <AdminPage /> },
            ],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
