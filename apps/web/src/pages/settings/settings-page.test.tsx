import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { i18n } from "@/i18n";
import * as settingsApi from "@/features/settings/api/settings";
import type { AppSettings, ProviderConnectionResult } from "@/features/settings/api/settings";
import type { AppUser } from "@/lib/api/client";
import { ThemeProvider } from "@/providers/theme-provider";
import { createTestQueryClient } from "@/test/query-client";
import { SettingsPage } from "./settings-page";

vi.mock("@/features/settings/api/settings", async () => {
  const actual = await vi.importActual<typeof import("@/features/settings/api/settings")>(
    "@/features/settings/api/settings",
  );

  return {
    ...actual,
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    testProviderConnection: vi.fn(),
  };
});

const DEFAULT_SYSTEM_PROMPT = [
  "你是 Knowledge Chatbox 的 AI 助手。",
  "请基于用户提供的问题、会话历史和检索到的资源内容，给出准确、简洁、可执行的回答。",
  "优先引用资源事实，不要编造未在上下文中出现的信息。",
  "永远回复中文。",
].join("\n");

function buildUser(role: "admin" | "user"): AppUser {
  return {
    id: 1,
    username: role,
    role,
    status: "active",
    theme_preference: "system",
  };
}

function buildSettingsPayload(overrides: Partial<AppSettings> = {}): AppSettings {
  const base: AppSettings = {
    id: 1,
    provider_profiles: {
      openai: {
        api_key: "********",
        base_url: "https://api.openai.com/v1",
        chat_model: "gpt-5.4",
        embedding_model: "text-embedding-3-small",
        vision_model: "gpt-5.4",
      },
      anthropic: {
        api_key: null,
        base_url: "https://api.anthropic.com",
        chat_model: "claude-sonnet-4-5",
        vision_model: "claude-sonnet-4-5",
      },
      voyage: {
        api_key: null,
        base_url: "https://api.voyageai.com/v1",
        embedding_model: "voyage-3.5",
      },
      ollama: {
        base_url: "http://localhost:11434",
        chat_model: "qwen3.5:4b",
        embedding_model: "nomic-embed-text",
        vision_model: "qwen3.5:4b",
      },
    },
    response_route: { provider: "openai", model: "gpt-5.4" },
    embedding_route: { provider: "openai", model: "text-embedding-3-small" },
    pending_embedding_route: null,
    vision_route: { provider: "openai", model: "gpt-5.4" },
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    provider_timeout_seconds: 60,
    updated_by_user_id: 1,
    updated_at: "2026-03-21T00:00:00Z",
    active_index_generation: 3,
    building_index_generation: null,
    index_rebuild_status: "idle",
    rebuild_started: false,
    reindex_required: false,
  };

  return {
    ...base,
    ...overrides,
    provider_profiles: {
      ...base.provider_profiles,
      ...overrides.provider_profiles,
      openai: {
        ...base.provider_profiles.openai,
        ...overrides.provider_profiles?.openai,
      },
      anthropic: {
        ...base.provider_profiles.anthropic,
        ...overrides.provider_profiles?.anthropic,
      },
      voyage: {
        ...base.provider_profiles.voyage,
        ...overrides.provider_profiles?.voyage,
      },
      ollama: {
        ...base.provider_profiles.ollama,
        ...overrides.provider_profiles?.ollama,
      },
    },
    response_route: {
      ...base.response_route,
      ...overrides.response_route,
    },
    embedding_route: {
      ...base.embedding_route,
      ...overrides.embedding_route,
    },
    pending_embedding_route:
      overrides.pending_embedding_route === undefined
        ? base.pending_embedding_route
        : overrides.pending_embedding_route,
    vision_route: {
      ...base.vision_route,
      ...overrides.vision_route,
    },
  };
}

type ProviderConnectionResultOverrides = {
  response?: Partial<ProviderConnectionResult["response"]>;
  embedding?: Partial<ProviderConnectionResult["embedding"]>;
  vision?: Partial<ProviderConnectionResult["vision"]>;
};

function buildConnectionResult(
  overrides: ProviderConnectionResultOverrides = {},
): ProviderConnectionResult {
  const base: ProviderConnectionResult = {
    response: {
      provider: "openai",
      model: "gpt-5.4",
      healthy: true,
      message: "ok",
      latency_ms: 10,
    },
    embedding: {
      provider: "openai",
      model: "text-embedding-3-small",
      healthy: true,
      message: "ok",
      latency_ms: 10,
    },
    vision: {
      provider: "openai",
      model: "gpt-5.4",
      healthy: true,
      message: "ok",
      latency_ms: 10,
    },
  };

  return {
    ...base,
    ...overrides,
    response: {
      ...base.response,
      ...overrides.response,
    },
    embedding: {
      ...base.embedding,
      ...overrides.embedding,
    },
    vision: {
      ...base.vision,
      ...overrides.vision,
    },
  };
}

function mockDesktopViewport() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1280,
  });

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderSettingsPage(user: AppUser = buildUser("admin"), initialEntry = "/settings") {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SettingsPage user={user} />
        </QueryClientProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDesktopViewport();
    await i18n.changeLanguage("zh-CN");
    vi.mocked(settingsApi.getSettings).mockResolvedValue(buildSettingsPayload());
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(buildSettingsPayload());
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(buildConnectionResult());
  });

  it("renders provider settings around the primary provider path", async () => {
    vi.mocked(settingsApi.getSettings).mockResolvedValue(
      buildSettingsPayload({
        provider_profiles: {
          openai: {
            api_key: "********",
            base_url: "https://api.openai.com/v1",
            chat_model: "gpt-5.4",
            embedding_model: "text-embedding-3-small",
            vision_model: "gpt-5.4",
          },
          anthropic: {
            api_key: null,
            base_url: "https://api.anthropic.com",
            chat_model: "claude-sonnet-4-5",
            vision_model: "claude-sonnet-4-5",
          },
          voyage: {
            api_key: null,
            base_url: "https://api.voyageai.com/v1",
            embedding_model: "voyage-3.5",
          },
          ollama: {
            base_url: "http://localhost:11434",
            chat_model: "qwen3.5:4b",
            embedding_model: "nomic-embed-text",
            vision_model: "qwen3.5:4b",
          },
        } as AppSettings["provider_profiles"],
        pending_embedding_route: { provider: "voyage", model: "voyage-3.5" },
      }),
    );

    renderSettingsPage();

    expect(screen.getByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
    expect(await screen.findByText("当前状态概览")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "主 Provider" })).toHaveTextContent("OpenAI");
    expect(screen.getByLabelText("Chat Model")).toHaveValue("gpt-5.4");
    expect(screen.getByLabelText("Embedding Model")).toHaveValue("text-embedding-3-small");
    expect(screen.getByLabelText("Vision Model")).toHaveValue("gpt-5.4");
    expect(screen.getByText("当前连接测试会包含 Vision 模型检查。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开高级配置" })).toBeInTheDocument();
    expect(screen.getAllByText("待切换：Voyage / voyage-3.5").length).toBeGreaterThan(0);
    expect(screen.getByText("当前索引：generation 3")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenAI API Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument();
    expect(
      screen.queryByText(
        "把聊天链路、检索链路和 provider 详情分开展示，避免把当前生效配置和待切换配置混在一起。",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "这里配置每次对话都会带上的显式 system prompt。你可以直接改写，也可以清空后保存。",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("系统提示词改动也会在这里统一保存，不再和 provider 配置混排。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("需要单独控制检索链路、提前维护备用模板或调整超时时，再展开这里。"),
    ).not.toBeInTheDocument();
  });

  it("includes ollama in the primary provider options", async () => {
    renderSettingsPage();

    fireEvent.click(await screen.findByRole("combobox", { name: "主 Provider" }));

    const providerOptions = await screen.findAllByRole("option");
    expect(providerOptions.map((option) => option.textContent?.trim())).toContain("Ollama");
  });

  it("saves the edited primary provider draft and shows rebuild feedback", async () => {
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(
      buildSettingsPayload({
        embedding_route: { provider: "openai", model: "text-embedding-3-large" },
        provider_profiles: {
          openai: {
            api_key: "********",
            base_url: "https://api.openai.com/v1",
            chat_model: "gpt-5.4",
            embedding_model: "text-embedding-3-large",
            vision_model: "gpt-5.4",
          },
        } as AppSettings["provider_profiles"],
        building_index_generation: 4,
        index_rebuild_status: "running",
        rebuild_started: true,
        reindex_required: true,
      }),
    );

    renderSettingsPage();

    fireEvent.change(await screen.findByLabelText("Embedding Model"), {
      target: { value: "text-embedding-3-large" },
    });
    fireEvent.change(screen.getByLabelText("Vision Model"), {
      target: { value: "gpt-5.4-mini" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(settingsApi.updateSettings).toHaveBeenCalled();
    });
    expect(vi.mocked(settingsApi.updateSettings).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        embedding_route: {
          provider: "openai",
          model: "text-embedding-3-large",
        },
        vision_route: {
          provider: "openai",
          model: "gpt-5.4-mini",
        },
        provider_profiles: expect.objectContaining({
          openai: expect.objectContaining({
            embedding_model: "text-embedding-3-large",
            vision_model: "gpt-5.4-mini",
          }),
        }),
      }),
    );

    expect(await screen.findByText("构建中：generation 4")).toBeInTheDocument();
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
  });

  it("tests the current primary draft and keeps the action pending until the request resolves", async () => {
    let resolveTest:
      | ((value: ProviderConnectionResult | PromiseLike<ProviderConnectionResult>) => void)
      | undefined;

    vi.mocked(settingsApi.testProviderConnection).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTest = resolve;
      }),
    );

    renderSettingsPage();

    fireEvent.change(await screen.findByLabelText("Chat Model"), {
      target: { value: "gpt-5.4-mini" },
    });
    fireEvent.change(screen.getByLabelText("Vision Model"), {
      target: { value: "gpt-5.4-vision-mini" },
    });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(await screen.findByRole("button", { name: /测试中/ })).toBeDisabled();

    await waitFor(() => {
      expect(settingsApi.testProviderConnection).toHaveBeenCalled();
    });
    expect(vi.mocked(settingsApi.testProviderConnection).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        response_route: {
          provider: "openai",
          model: "gpt-5.4-mini",
        },
        vision_route: {
          provider: "openai",
          model: "gpt-5.4-vision-mini",
        },
        provider_profiles: expect.objectContaining({
          openai: expect.objectContaining({
            chat_model: "gpt-5.4-mini",
            vision_model: "gpt-5.4-vision-mini",
          }),
        }),
      }),
    );

    resolveTest?.(buildConnectionResult());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled();
    });
  });

  it("shows localized OpenAI compatibility guidance when the model is unavailable", async () => {
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildConnectionResult({
        response: {
          healthy: false,
          code: "openai_model_not_available",
          message: "OpenAI model gpt-5.4 is not available.",
        },
      }),
    );

    renderSettingsPage();

    fireEvent.click(await screen.findByRole("button", { name: "测试连接" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("模型列表里没有 gpt-5.4");
  });

  it("shows localized OpenAI authentication guidance when the api key is rejected", async () => {
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildConnectionResult({
        response: {
          healthy: false,
          code: "openai_invalid_api_key",
          message: "OpenAI API key is invalid or rejected by the gateway.",
        },
      }),
    );

    renderSettingsPage();

    fireEvent.click(await screen.findByRole("button", { name: "测试连接" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("API Key 无效或被拒绝");
  });

  it("shows localized Ollama base url guidance when the gateway is unreachable", async () => {
    vi.mocked(settingsApi.getSettings).mockResolvedValue(
      buildSettingsPayload({
        provider_profiles: {
          ollama: {
            base_url: "http://host.docker.internal:11434",
          },
        } as AppSettings["provider_profiles"],
      }),
    );
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildConnectionResult({
        response: {
          provider: "ollama",
          model: "qwen3.5:4b",
          healthy: false,
          code: "ollama_base_url_unreachable",
          message: "Ollama Base URL http://host.docker.internal:11434 returned 502 Bad Gateway.",
        },
        embedding: {
          provider: "ollama",
          model: "nomic-embed-text",
          healthy: false,
          code: "ollama_base_url_unreachable",
          message: "Ollama Base URL http://host.docker.internal:11434 returned 502 Bad Gateway.",
        },
        vision: {
          provider: "ollama",
          model: "qwen3.5:4b",
          healthy: false,
          code: "ollama_base_url_unreachable",
          message: "Ollama Base URL http://host.docker.internal:11434 returned 502 Bad Gateway.",
        },
      }),
    );

    renderSettingsPage();

    fireEvent.click(await screen.findByRole("button", { name: "测试连接" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("当前 Ollama Base URL（http://host.docker.internal:11434）");
    expect(alert).toHaveTextContent("若 API 直接运行在本机，请改成 http://localhost:11434");
  });

  it("shows zh-CN validation feedback when a required provider field is missing", async () => {
    renderSettingsPage();

    fireEvent.change(await screen.findByLabelText("Chat Model"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByText("Chat Model 为必填项。")).toBeInTheDocument();
    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  });

  it("shows English validation feedback when the UI language changes", async () => {
    await i18n.changeLanguage("en");
    renderSettingsPage();

    fireEvent.change(await screen.findByLabelText("Chat Model"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    expect(await screen.findByText("Chat Model is required.")).toBeInTheDocument();
    expect(screen.queryByText("Chat Model 为必填项。")).not.toBeInTheDocument();
    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  });

  it("shows only self-service sections for non-admin users without loading system settings", async () => {
    renderSettingsPage(buildUser("user"), "/settings?section=preferences");

    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "主 Provider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "系统提示词" })).not.toBeInTheDocument();
    expect(settingsApi.getSettings).not.toHaveBeenCalled();
  });
});
