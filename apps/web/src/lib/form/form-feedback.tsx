import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FormErrorTranslator } from "@/lib/forms";
import { getFirstFormError, toFieldErrorItems } from "@/lib/forms";

export function getFieldErrorItems(
  errors: unknown[],
  translate?: FormErrorTranslator,
  manualError?: string,
) {
  return toFieldErrorItems(errors, translate, manualError);
}

export function getFormErrorMessage(errors: unknown[], translate?: FormErrorTranslator) {
  return getFirstFormError(errors, translate);
}

export function FormErrorAlert({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
