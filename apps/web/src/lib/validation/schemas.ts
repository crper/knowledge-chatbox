import { z } from "zod";

export const trimmedString = () => z.string().trim();

export const requiredString = (message?: string) =>
  trimmedString().min(1, { message: message ?? "此字段不能为空" });

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

export const passwordSchema = (options: PasswordSchemaOptions = {}) => {
  const minLength = options.minLength ?? 8;
  const requiredMessage = options.requiredMessage ?? "auth:passwordRequiredError";
  const tooShortMessage = resolvePasswordMessage(
    options.tooShortMessage,
    `auth:passwordLengthValidationError:${minLength}`,
    minLength,
  );

  return trimmedString().superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: requiredMessage,
      });
      return;
    }

    if (value.length < minLength) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: tooShortMessage,
      });
    }
  });
};

export const httpUrlSchema = (options: { allowEmpty?: boolean; message?: string } = {}) => {
  const { allowEmpty = true, message = "请输入有效的 HTTP/HTTPS 地址" } = options;
  return z
    .string()
    .transform((val) => val.trim())
    .refine(
      (val) => {
        if (!val) {
          return allowEmpty;
        }

        try {
          const url = new URL(val);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message },
    );
};

export const positiveIntegerInRange = (min: number, max: number, message?: string) =>
  z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === "number" ? val : Number(val)))
    .refine((val) => Number.isInteger(val) && val >= min && val <= max, {
      message: message ?? `请输入 ${min} 到 ${max} 之间的正整数`,
    });

export const loginSchema = z.object({
  username: requiredString("auth:usernameRequiredError"),
  password: requiredString("auth:passwordRequiredError"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: requiredString("users:usernameRequiredError"),
  password: passwordSchema({
    requiredMessage: "users:initialPasswordRequiredError",
    tooShortMessage: (minLength) => `users:passwordLengthValidationError:${minLength}`,
  }),
  role: z.enum(["admin", "user"]).default("user"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: requiredString("auth:currentPasswordRequiredError"),
  newPassword: passwordSchema({
    requiredMessage: "auth:newPasswordRequiredError",
    tooShortMessage: (minLength) => `auth:passwordLengthValidationError:${minLength}`,
  }),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const resetPasswordSchema = z.object({
  newPassword: trimmedString().refine((value) => value.length >= 8, {
    message: "users:resetPasswordValidationError",
  }),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const providerProfileOpenaiSchema = z.object({
  api_key: z.string().nullable().optional(),
  base_url: z.string().nullable().optional(),
  chat_model: z.string().nullable().optional(),
  embedding_model: z.string().nullable().optional(),
  vision_model: z.string().nullable().optional(),
});

export const providerProfileAnthropicSchema = z.object({
  api_key: z.string().nullable().optional(),
  base_url: z.string().nullable().optional(),
  chat_model: z.string().nullable().optional(),
  vision_model: z.string().nullable().optional(),
});

export const providerProfileVoyageSchema = z.object({
  api_key: z.string().nullable().optional(),
  base_url: z.string().nullable().optional(),
  embedding_model: z.string().nullable().optional(),
});

export const providerProfileOllamaSchema = z.object({
  api_key: z.string().nullable().optional(),
  base_url: z.string().nullable().optional(),
  chat_model: z.string().nullable().optional(),
  embedding_model: z.string().nullable().optional(),
  vision_model: z.string().nullable().optional(),
});

export const providerProfilesSchema = z.object({
  anthropic: providerProfileAnthropicSchema,
  ollama: providerProfileOllamaSchema,
  openai: providerProfileOpenaiSchema,
  voyage: providerProfileVoyageSchema,
});

export const capabilityRouteSchema = (providerEnum: z.ZodTypeAny) =>
  z.object({
    provider: providerEnum,
    model: z.string(),
  });

export const responseProviderEnum = z.enum(["ollama", "openai", "anthropic"]);
export const embeddingProviderEnum = z.enum(["openai", "voyage", "ollama"]);
export const visionProviderEnum = z.enum(["openai", "anthropic", "ollama"]);

export const templateProviderEnum = z.enum(["ollama", "openai", "anthropic", "voyage"]);

export const providerSettingsSchema = z
  .object({
    primaryProvider: responseProviderEnum,
    retrievalOverrideEnabled: z.boolean().default(false),
    retrievalProvider: embeddingProviderEnum,
    templateProvider: templateProviderEnum,
    providerProfiles: providerProfilesSchema,
    providerTimeoutSeconds: positiveIntegerInRange(1, 600),
  })
  .refine(
    (data) => {
      const profile = data.providerProfiles[data.primaryProvider];
      const chatModel = profile?.chat_model?.trim();
      return !!chatModel && chatModel.length > 0;
    },
    {
      message: "settings:chatModelRequiredError",
      path: ["providerProfiles", "chat_model"],
    },
  )
  .refine(
    (data) => {
      const profile = data.providerProfiles[data.primaryProvider];
      if (!profile) return false;

      if ("embedding_model" in profile) {
        const embeddingModel = profile.embedding_model?.trim();
        return !!embeddingModel && embeddingModel.length > 0;
      }

      return true;
    },
    {
      message: "settings:embeddingModelRequiredError",
      path: ["providerProfiles", "embedding_model"],
    },
  )
  .refine(
    (data) => {
      const profile = data.providerProfiles[data.primaryProvider];
      if (!profile) return false;

      if ("vision_model" in profile) {
        const visionModel = profile.vision_model?.trim();
        return !!visionModel && visionModel.length > 0;
      }

      return true;
    },
    {
      message: "settings:visionModelRequiredError",
      path: ["providerProfiles", "vision_model"],
    },
  )
  .refine(
    (data) => {
      if (data.primaryProvider !== "ollama") return true;
      const baseUrl = data.providerProfiles.ollama?.base_url?.trim();
      return !!baseUrl && baseUrl.length > 0;
    },
    {
      message: "settings:providerTestOllamaBaseUrlMissing",
      path: ["providerProfiles", "ollama", "base_url"],
    },
  )
  .refine(
    (data) => {
      if (!data.retrievalOverrideEnabled) return true;
      const profile = data.providerProfiles[data.retrievalProvider];
      const embeddingModel = profile?.embedding_model?.trim();
      return !!embeddingModel && embeddingModel.length > 0;
    },
    {
      message: "settings:retrievalEmbeddingModelRequiredError",
      path: ["providerProfiles", "embedding_model"],
    },
  );

export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema.nullable(),
    error: z.literal(null),
  });

export const apiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  data: z.literal(null),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .nullable(),
});
