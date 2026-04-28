import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FormErrorTranslator } from "@/lib/forms";
import { translateFieldErrors } from "@/lib/forms";
import type { AnyFormApi } from "./types";

type FormFieldBaseProps = {
  description?: string;
  fieldClassName?: string;
  form: AnyFormApi;
  label: string;
  labelClassName?: string;
  name: string;
  onChange?: () => void;
  t?: FormErrorTranslator;
};

export function FormTextField({
  description,
  fieldClassName,
  form,
  label,
  labelClassName,
  name,
  onChange,
  t,
  ...inputProps
}: FormFieldBaseProps &
  Omit<React.ComponentProps<typeof Input>, "form" | "name" | "value" | "onChange" | "onBlur">) {
  return (
    <form.Field name={name}>
      {(field: {
        state: { value: unknown; meta: { errors: unknown[] } };
        handleChange: (value: unknown) => void;
        handleBlur: () => void;
      }) => (
        <Field className={fieldClassName}>
          {inputProps.id ? (
            <FieldLabel className={labelClassName} htmlFor={inputProps.id}>
              {label}
            </FieldLabel>
          ) : (
            <FieldLabel className={labelClassName}>{label}</FieldLabel>
          )}
          <Input
            aria-label={label}
            aria-invalid={field.state.meta.errors.length > 0}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              onChange?.();
              field.handleChange(event.target.value);
            }}
            onBlur={field.handleBlur}
            value={field.state.value as string}
            {...inputProps}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={translateFieldErrors(field.state.meta.errors, t)} />
        </Field>
      )}
    </form.Field>
  );
}

export function FormTextareaField({
  description,
  fieldClassName,
  form,
  label,
  labelClassName,
  name,
  onChange,
  t,
  ...textareaProps
}: FormFieldBaseProps &
  Omit<React.ComponentProps<typeof Textarea>, "form" | "name" | "value" | "onChange">) {
  return (
    <form.Field name={name}>
      {(field: {
        state: { value: unknown; meta: { errors: unknown[] } };
        handleChange: (value: unknown) => void;
        handleBlur: () => void;
      }) => (
        <Field className={fieldClassName}>
          {textareaProps.id ? (
            <FieldLabel className={labelClassName} htmlFor={textareaProps.id}>
              {label}
            </FieldLabel>
          ) : (
            <FieldLabel className={labelClassName}>{label}</FieldLabel>
          )}
          <Textarea
            aria-label={label}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
              onChange?.();
              field.handleChange(event.target.value);
            }}
            value={(field.state.value as string) ?? ""}
            {...textareaProps}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={translateFieldErrors(field.state.meta.errors, t)} />
        </Field>
      )}
    </form.Field>
  );
}
