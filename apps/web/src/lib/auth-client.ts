import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Standalone-API mode: point auth at the API origin. Same-origin default is
// undefined (better-auth defaults to the page origin).
const baseURL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || undefined;

export const authClient = createAuthClient({
  ...(baseURL ? { baseURL } : {}),
  plugins: [
    twoFactorClient(),
    {
      id: "student-signup",
      pathMethods: { "/sign-up/student": "POST" } as const,
      // The plugin is declared on the server, so its type is not available here.
      // `signUpStudent` below is the one call this client makes through it.
      $InferServerPlugin: {} as Record<string, never>,
    },
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * `POST /api/auth/sign-up/student` — the server plugin's one endpoint. The body
 * schema lives on the server; this side only needs the error envelope.
 */
export async function signUpStudent(input: Record<string, unknown>): Promise<{
  error?: { message?: string } | null;
}> {
  return (
    authClient.signUp as unknown as {
      student: (data: Record<string, unknown>) => Promise<{
        error?: { message?: string } | null;
      }>;
    }
  ).student(input);
}
