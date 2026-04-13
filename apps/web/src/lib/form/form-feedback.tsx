import { Alert, AlertDescription } from "@/components/ui/alert";

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
