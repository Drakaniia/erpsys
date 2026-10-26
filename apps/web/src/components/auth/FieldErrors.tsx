import type { FormFieldApi } from "./AuthField";

export default function FieldErrors({
  field,
  id,
}: {
  field: FormFieldApi;
  id?: string;
}) {
  const messages = [
    ...new Set(
      field.state.meta.errors.map((error) =>
        typeof error === "string" ? error : (error as Error).message,
      ),
    ),
  ].slice(0, 1);

  return (
    <div aria-live="polite">
      {messages.map((message) => (
        <p key={message} className="auth-field-error" role="alert" id={id}>
          {message}
        </p>
      ))}
    </div>
  );
}
