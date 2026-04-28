import { z } from "zod";

function addCustomIssue(ctx: z.RefinementCtx, message: string, path: Array<string | number>) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
}

const trimmedString = () => z.string().trim();

const requiredString = (message?: string) =>
  trimmedString().min(1, { message: message ?? "common:requiredFieldError" });

type PasswordSchemaOptions = {
  minLength?: number;
  requiredMessage?: string;
  tooShortMessage?: string | ((minLength: number) => string);
};

function resolvePasswordMessage(
  message: string | ((minLength: number) => string) | undefined,
  fallback: string,
  minLength: number,
) {
  if (typeof message === "function") {
    return message(minLength);
  }
  return message ?? fallback;
}

const passwordSchema = (options: PasswordSchemaOptions = {}) => {
  const minLength = options.minLength ?? 8;
  const requiredMessage = options.requiredMessage ?? "auth:passwordRequiredError";
  const tooShortMessage = resolvePasswordMessage(
    options.tooShortMessage,
    `auth:passwordLengthValidationError:${minLength}`,
    minLength,
  );

  return trimmedString().min(1, { message: requiredMessage }).min(minLength, {
    message: tooShortMessage,
  });
};

const httpUrlSchema = (options: { allowEmpty?: boolean; message?: string } = {}) => {
  const { allowEmpty = true, message = "common:httpUrlInvalidError" } = options;
  const urlValidator = z.url({ protocol: /^https?$/, error: message });

  if (allowEmpty) {
    return z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), urlValidator]));
  }

  return z.string().trim().pipe(urlValidator);
};

const positiveIntegerInRange = (min: number, max: number, message?: string) =>
  z.coerce
    .number()
    .int({ message: message ?? `common:positiveIntegerRangeError:${min}:${max}` })
    .min(min, {
      message: message ?? `common:positiveIntegerRangeError:${min}:${max}`,
    })
    .max(max, {
      message: message ?? `common:positiveIntegerRangeError:${min}:${max}`,
    });

function createProviderProfileSchema(
  fields: Array<"api_key" | "base_url" | "chat_model" | "embedding_model" | "vision_model">,
) {
  const shape: Record<string, z.ZodOptional<z.ZodNullable<z.ZodString>>> = {};
  for (const field of fields) {
    shape[field] = z.string().nullable().optional();
  }
  return z.object(shape);
}

export const loginSchema = z.object({
  username: requiredString("auth:usernameRequiredError"),
  password: requiredString("auth:passwordRequiredError"),
});

export const createUserSchema = z.object({
  username: requiredString("users:usernameRequiredError"),
  password: passwordSchema({
    requiredMessage: "users:initialPasswordRequiredError",
    tooShortMessage: (minLength) => `users:passwordLengthValidationError:${minLength}`,
  }),
  role: z.enum(["admin", "user"]).default("user"),
});

export const changePasswordSchema = z.object({
  currentPassword: requiredString("auth:currentPasswordRequiredError"),
  newPassword: passwordSchema({
    requiredMessage: "auth:newPasswordRequiredError",
    tooShortMessage: (minLength) => `auth:passwordLengthValidationError:${minLength}`,
  }),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema({
    requiredMessage: "users:resetPasswordRequiredError",
    tooShortMessage: "users:resetPasswordValidationError",
  }),
});

export const systemPromptSchema = z.object({
  system_prompt: z.string(),
});

const providerProfileOpenaiSchema = createProviderProfileSchema([
  "api_key",
  "base_url",
  "chat_model",
  "embedding_model",
  "vision_model",
]);

const providerProfileAnthropicSchema = createProviderProfileSchema([
  "api_key",
  "base_url",
  "chat_model",
  "vision_model",
]);

const providerProfileVoyageSchema = createProviderProfileSchema([
  "api_key",
  "base_url",
  "embedding_model",
]);

const providerProfileOllamaSchema = createProviderProfileSchema([
  "api_key",
  "base_url",
  "chat_model",
  "embedding_model",
  "vision_model",
]);

const providerProfilesSchema = z.object({
  anthropic: providerProfileAnthropicSchema,
  ollama: providerProfileOllamaSchema,
  openai: providerProfileOpenaiSchema,
  voyage: providerProfileVoyageSchema,
});

const responseProviderEnum = z.enum(["ollama", "openai", "anthropic"]);
const embeddingProviderEnum = z.enum(["openai", "voyage", "ollama"]);

export const templateProviderEnum = z.enum(["ollama", "openai", "anthropic", "voyage"]);

export const defaultEmbeddingProviderByPrimary = {
  anthropic: "voyage",
  ollama: "ollama",
  openai: "openai",
} as const satisfies Record<
  z.infer<typeof responseProviderEnum>,
  z.infer<typeof embeddingProviderEnum>
>;

function validatePrimaryProviderProfile(
  data: z.infer<typeof providerSettingsSchema>,
  ctx: z.RefinementCtx,
) {
  const primaryProfile = data.providerProfiles[data.primaryProvider];
  const primaryBaseUrl = primaryProfile.base_url?.trim() ?? "";
  const primaryChatModel = primaryProfile.chat_model?.trim() ?? "";
  const primaryVisionModel = primaryProfile.vision_model?.trim() ?? "";

  if (!primaryChatModel) {
    addCustomIssue(ctx, "settings:chatModelRequiredError", [
      "providerProfiles",
      data.primaryProvider,
      "chat_model",
    ]);
  }

  if (!primaryVisionModel) {
    addCustomIssue(ctx, "settings:visionModelRequiredError", [
      "providerProfiles",
      data.primaryProvider,
      "vision_model",
    ]);
  }

  if (data.primaryProvider === "ollama" && !primaryBaseUrl) {
    addCustomIssue(ctx, "settings:providerTestOllamaBaseUrlMissing", [
      "providerProfiles",
      "ollama",
      "base_url",
    ]);
  }

  const shouldValidatePrimaryBaseUrl = !(
    data.primaryProvider === "ollama" && primaryBaseUrl.length === 0
  );
  const baseUrlResult = shouldValidatePrimaryBaseUrl
    ? httpUrlSchema({
        allowEmpty: data.primaryProvider !== "ollama",
        message: "settings:baseUrlInvalidError",
      }).safeParse(primaryBaseUrl)
    : { success: true as const };

  if (!baseUrlResult.success) {
    addCustomIssue(ctx, "settings:baseUrlInvalidError", [
      "providerProfiles",
      data.primaryProvider,
      "base_url",
    ]);
  }
}

function validateDefaultEmbeddingModel(
  data: z.infer<typeof providerSettingsSchema>,
  ctx: z.RefinementCtx,
) {
  const defaultEmbeddingProvider = defaultEmbeddingProviderByPrimary[data.primaryProvider];
  const defaultEmbeddingModel =
    data.providerProfiles[defaultEmbeddingProvider].embedding_model?.trim() ?? "";

  if (!defaultEmbeddingModel) {
    addCustomIssue(ctx, "settings:embeddingModelRequiredError", [
      "providerProfiles",
      defaultEmbeddingProvider,
      "embedding_model",
    ]);
  }
}

function validateRetrievalOverride(
  data: z.infer<typeof providerSettingsSchema>,
  ctx: z.RefinementCtx,
) {
  if (!data.retrievalOverrideEnabled) return;

  const retrievalEmbeddingModel =
    data.providerProfiles[data.retrievalProvider].embedding_model?.trim() ?? "";

  if (!retrievalEmbeddingModel) {
    addCustomIssue(ctx, "settings:retrievalEmbeddingModelRequiredError", [
      "providerProfiles",
      data.retrievalProvider,
      "embedding_model",
    ]);
  }
}

export const providerSettingsSchema = z
  .object({
    primaryProvider: responseProviderEnum,
    retrievalOverrideEnabled: z.boolean().default(false),
    retrievalProvider: embeddingProviderEnum,
    templateProvider: templateProviderEnum,
    providerProfiles: providerProfilesSchema,
    providerTimeoutSeconds: positiveIntegerInRange(1, 600, "settings:providerTimeoutInvalidError"),
  })
  .superRefine((data, ctx) => {
    validatePrimaryProviderProfile(data, ctx);
    validateDefaultEmbeddingModel(data, ctx);
    validateRetrievalOverride(data, ctx);
  });
