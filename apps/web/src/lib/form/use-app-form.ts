import { revalidateLogic, useForm } from "@tanstack/react-form";
import { z } from "zod";

import type { FormValidationResult } from "@/lib/forms";
import { createZodValidator } from "@/lib/validation/form-adapter";

type AppFormValidator<TValues, TFieldName extends string> = (
  values: TValues,
) => FormValidationResult<TFieldName> | undefined;

type AppFormOptions<TValues, TFieldName extends string> = {
  defaultValues: TValues;
  formI18nKey?: string;
  onSubmit: (args: { formApi: any; value: TValues }) => Promise<void>;
  schema?: z.ZodType<TValues>;
  validationMode?: "submit" | "submit-blur";
  validator?: AppFormValidator<TValues, TFieldName>;
};

export function useAppForm<TValues, TFieldName extends string = string>({
  defaultValues,
  formI18nKey,
  onSubmit,
  schema,
  validationMode = "submit-blur",
  validator,
}: AppFormOptions<TValues, TFieldName>) {
  const resolvedValidator =
    validator ??
    (schema
      ? createZodValidator<TValues, TFieldName>(schema, {
          formI18nKey,
        })
      : undefined);

  return useForm({
    defaultValues,
    validationLogic: revalidateLogic({
      mode: "submit",
      modeAfterSubmission: validationMode === "submit" ? "submit" : "blur",
    }),
    validators: resolvedValidator
      ? {
          onDynamic: ({ value }) => resolvedValidator(value as TValues),
        }
      : undefined,
    onSubmit,
  });
}
