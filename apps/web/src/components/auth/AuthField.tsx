import { useState } from "react";
import FieldErrors from "./FieldErrors";

/**
 * The slice of TanStack form field the auth fields touch. `@tanstack/react-form`
 * hands exactly this shape to a `Field` render prop, so the port keeps the
 * Svelte component's contract while dropping the Svelte-specific type.
 */
export interface FormFieldApi {
  name: string;
  state: {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    value: any;
    meta: { errors: any[]; isTouched: boolean };
  };
  handleChange: (value: any) => void;
  handleBlur: () => void;
  setMeta: (updater: (prev: any) => any) => void;
}

export default function AuthField({
  field,
  label,
  type = "text",
  autocomplete,
  placeholder,
  hint = null,
  clearOnEdit = true,
  labelAction,
  onedit,
}: {
  field: FormFieldApi;
  label: string;
  type?: "text" | "email" | "password";
  autocomplete?: string;
  placeholder?: string;
  hint?: string | null;
  clearOnEdit?: boolean;
  labelAction?: React.ReactNode;
  onedit?: () => void;
}) {
  const [focused, setFocused] = useState(false);

  const hasError = field.state.meta.errors.length > 0;
  // Three visual states from two signals: active while focused OR holding
  // a value, so a filled field keeps the label parked upper-left on blur.
  const hasValue = String(field.state.value ?? "").length > 0;
  const isActive = focused || hasValue;

  function handleInput(value: string) {
    field.handleChange(value);
    if (clearOnEdit) {
      field.setMeta((prev) => ({ ...prev, errors: [], isTouched: false }));
    }
    onedit?.();
  }

  return (
    <div className="space-y-2">
      {labelAction ? (
        <div className="flex items-center justify-end">{labelAction}</div>
      ) : null}
      <div className="auth-float">
        <input
          id={field.name}
          name={field.name}
          type={type}
          autoComplete={autocomplete}
          placeholder={isActive ? placeholder : undefined}
          className="auth-input auth-float-control"
          data-active={isActive}
          aria-invalid={hasError}
          aria-describedby={hint ? `${field.name}-hint` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            field.handleBlur();
          }}
          value={String(field.state.value ?? "")}
          onChange={(event) => handleInput(event.target.value)}
        />
        <label
          htmlFor={field.name}
          className="auth-float-label"
          data-active={isActive}
          data-invalid={hasError}
        >
          {label}
        </label>
      </div>
      {hint ? (
        <p id={`${field.name}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <FieldErrors field={field} />
    </div>
  );
}
