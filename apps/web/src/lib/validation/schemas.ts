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

export const systemPromptSchema = z.object({
  system_prompt: z.string(),
});

export type SystemPromptInput = z.infer<typeof systemPromptSchema>;

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

const defaultEmbeddingProviderByPrimary = {
  anthropic: "voyage",
  ollama: "ollama",
  openai: "openai",
} as const satisfies Record<
  z.infer<typeof responseProviderEnum>,
  z.infer<typeof embeddingProviderEnum>
>;

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
    const primaryProfile = data.providerProfiles[data.primaryProvider];
    const primaryBaseUrl = primaryProfile.base_url?.trim() ?? "";
    const primaryChatModel = primaryProfile.chat_model?.trim() ?? "";
    const primaryVisionModel = primaryProfile.vision_model?.trim() ?? "";
    const defaultEmbeddingProvider = defaultEmbeddingProviderByPrimary[data.primaryProvider];
    const defaultEmbeddingModel =
      data.providerProfiles[defaultEmbeddingProvider].embedding_model?.trim() ?? "";

    if (!primaryChatModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "settings:chatModelRequiredError",
        path: ["providerProfiles", data.primaryProvider, "chat_model"],
      });
    }

    if (!defaultEmbeddingModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "settings:embeddingModelRequiredError",
        path: ["providerProfiles", defaultEmbeddingProvider, "embedding_model"],
      });
    }

    if (!primaryVisionModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "settings:visionModelRequiredError",
        path: ["providerProfiles", data.primaryProvider, "vision_model"],
      });
    }

    if (data.primaryProvider === "ollama" && !primaryBaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "settings:providerTestOllamaBaseUrlMissing",
        path: ["providerProfiles", "ollama", "base_url"],
      });
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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "settings:baseUrlInvalidError",
        path: ["providerProfiles", data.primaryProvider, "base_url"],
      });
    }

    if (data.retrievalOverrideEnabled) {
      const retrievalEmbeddingModel =
        data.providerProfiles[data.retrievalProvider].embedding_model?.trim() ?? "";

      if (!retrievalEmbeddingModel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "settings:retrievalEmbeddingModelRequiredError",
          path: ["providerProfiles", data.retrievalProvider, "embedding_model"],
        });
      }
    }
  });

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
