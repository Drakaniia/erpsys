import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { authClient } from "$lib/auth-client";
import FieldErrors from "../../components/auth/FieldErrors";

/** `routes/auth/login/reset-password/+page.svelte` — token-based reset form. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters");

  const [formError, setFormError] = useState("");

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    onSubmit: async ({ value, formApi }) => {
      setFormError("");
      const parsed = z
        .object({ password: passwordSchema, confirm: z.string() })
        .refine((v) => v.password === v.confirm, {
          message: "Passwords do not match",
          path: ["confirm"],
        })
        .safeParse(value);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const name = issue.path[0] as "password" | "confirm";
          formApi.setFieldMeta(name, (prev) => ({
            ...prev,
            errors: [issue.message],
          }));
        }
        return;
      }
      const result = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });
      if (result.error) {
        setFormError(
          result.error.message || "This link is invalid or has expired.",
        );
        return;
      }
      navigate("/login");
    },
  });

  useEffect(() => {
    document.title = "Reset Password — ERPSYS";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex";
  }, []);

  function PasswordField({
    name,
    label,
  }: {
    name: "password" | "confirm";
    label: string;
  }) {
    return (
      <form.Field name={name}>
        {(field) => {
          const hasError = field.state.meta.errors.length > 0;
          return (
            <div className="space-y-1.5">
              <label
                htmlFor={field.name}
                className="text-sm font-medium text-auth-ink"
              >
                {label}
              </label>
              <input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="new-password"
                className={`h-11 w-full rounded-md border bg-white px-3 text-[15px] text-auth-ink outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-blue ${
                  hasError ? "border-error" : "border-auth-border"
                }`}
                aria-invalid={hasError}
                onBlur={field.handleBlur}
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  field.setMeta((prev) => ({
                    ...prev,
                    errors: [],
                    isTouched: false,
                  }));
                  setFormError("");
                }}
              />
              <FieldErrors field={field} />
            </div>
          );
        }}
      </form.Field>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4 py-10">
      <div className="auth-enter w-full max-w-[440px]">
        <div className="rounded-lg border border-auth-border bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.08)]">
          {!token ? (
            <>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-auth-ink">
                Invalid reset link
              </h1>
              <p className="mt-1 text-sm text-muted">
                This link is missing its token. Request a new one and try again.
              </p>
              <div className="mt-6 text-center">
                <Link
                  to="/login/forgot-password"
                  className="text-sm text-auth-blue hover:underline"
                >
                  Request a new link
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-auth-ink">
                Set a new password
              </h1>
              <p className="mt-1 text-sm text-muted">
                Choose a strong password for your BukSU account.
              </p>

              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void form.handleSubmit();
                }}
              >
                <PasswordField name="password" label="New password" />
                <PasswordField name="confirm" label="Confirm password" />

                {formError ? (
                  <p
                    className="rounded-md bg-error/10 px-3 py-2 text-sm text-error"
                    role="alert"
                  >
                    {formError}
                  </p>
                ) : null}

                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <button
                      type="submit"
                      className="press h-12 w-full rounded-lg bg-auth-blue text-[15px] font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Updating…" : "Set new password"}
                    </button>
                  )}
                </form.Subscribe>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
