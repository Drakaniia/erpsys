// Each page lives in its own file under `auth-pages/`; this module re-exports them so `router.tsx` keeps a single import site (mirrors the server's `queues.ts` + `queues/` pattern).
export { LoadingPage } from "./auth-pages/loading";
export { AuthErrorPage } from "./auth-pages/error";
export { ConnectedAccountsPage } from "./auth-pages/accounts";
export { CopyCodePage } from "./auth-pages/copy-code";
export { ForgotPasswordPage } from "./auth-pages/forgot-password";
export { ResetPasswordPage } from "./auth-pages/reset-password";
