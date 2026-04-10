import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { i18n } from "@/i18n";
import * as settingsApi from "@/features/settings/api/settings";
import type { AppSettings, ProviderConnectionResult } from "@/features/settings/api/settings";
import type { AppUser } from "@/lib/api/client";
import { ThemeProvider } from "@/providers/theme-provider";
import { buildAppSettings, buildAppUser, buildProviderConnectionResult } from "@/test/fixtures/app";
import { createTestQueryClient } from "@/test/query-client";
import { TestRouter } from "@/test/test-router";
import { mockDesktopViewport } from "@/test/viewport";
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

function renderSettingsPage(
  user: AppUser = buildAppUser("admin"),
  initialEntry = user.role === "admin" ? "/settings/providers" : "/settings/preferences",
) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return render(
    <TestRouter
      initialEntry={initialEntry}
      path={initialEntry.startsWith("/settings/") ? "/settings/:section" : "/settings"}
    >
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SettingsPage user={user} />
        </QueryClientProvider>
      </ThemeProvider>
    </TestRouter>,
  );
}

describe("SettingsPage", () => {
  beforeEach(async () => {
    mockDesktopViewport();
    await i18n.changeLanguage("zh-CN");
    vi.mocked(settingsApi.getSettings).mockResolvedValue(buildAppSettings());
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(buildAppSettings());
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildProviderConnectionResult(),
    );
  });

  it("renders provider settings around the primary provider path", async () => {
    vi.mocked(settingsApi.getSettings).mockResolvedValue(
      buildAppSettings({
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

    expect(await screen.findByRole("heading", { name: "提供商配置" })).toBeInTheDocument();
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

  it("expands advanced settings and reveals retrieval and timeout controls", async () => {
    renderSettingsPage();

    fireEvent.click(await screen.findByRole("button", { name: "展开高级配置" }));

    expect(await screen.findByText("检索覆盖")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider Timeout (Seconds)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起高级配置" })).toBeInTheDocument();
  });

  it("reopens advanced settings when timeout validation fails while collapsed", async () => {
    renderSettingsPage();

    fireEvent.click(await screen.findByRole("button", { name: "展开高级配置" }));
    fireEvent.change(screen.getByLabelText("Provider Timeout (Seconds)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "收起高级配置" }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByRole("button", { name: "收起高级配置" })).toBeInTheDocument();
    expect(screen.getByLabelText("Provider Timeout (Seconds)")).toBeInTheDocument();
    expect(screen.getByText("请先修正当前配置中的高亮字段。")).toBeInTheDocument();
  });

  it("saves the edited primary provider draft and shows rebuild feedback", async () => {
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(
      buildAppSettings({
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

  it("keeps the latest saved settings visible without depending on a follow-up refresh", async () => {
    const savedSettings = buildAppSettings({
      provider_profiles: {
        openai: {
          chat_model: "gpt-5.4-mini",
        },
      } as AppSettings["provider_profiles"],
      response_route: { provider: "openai", model: "gpt-5.4-mini" },
    });
    vi.mocked(settingsApi.getSettings).mockResolvedValueOnce(buildAppSettings());
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(savedSettings);

    renderSettingsPage();

    fireEvent.change(await screen.findByLabelText("Chat Model"), {
      target: { value: "gpt-5.4-mini" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(settingsApi.updateSettings).toHaveBeenCalled();
    });

    expect(await screen.findByDisplayValue("gpt-5.4-mini")).toBeInTheDocument();
    expect(settingsApi.getSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

    resolveTest?.(buildProviderConnectionResult());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled();
    });
  });

  it("shows localized OpenAI compatibility guidance when the model is unavailable", async () => {
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildProviderConnectionResult({
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
      buildProviderConnectionResult({
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
      buildAppSettings({
        provider_profiles: {
          ollama: {
            base_url: "http://host.docker.internal:11434",
          },
        } as AppSettings["provider_profiles"],
      }),
    );
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildProviderConnectionResult({
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

  it("blocks save when the active provider base url is not a valid absolute http/https url", async () => {
    renderSettingsPage();

    fireEvent.change(await screen.findByLabelText("OpenAI Base URL"), {
      target: { value: "api.openai.com/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(
      await screen.findByText("请输入完整地址，必须以 http:// 或 https:// 开头。"),
    ).toBeInTheDocument();
    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  });

  it("shows a partial connection summary with three capability rows", async () => {
    vi.mocked(settingsApi.testProviderConnection).mockResolvedValue(
      buildProviderConnectionResult({
        embedding: {
          healthy: false,
          message: "embedding unavailable",
        },
      }),
    );

    renderSettingsPage();

    fireEvent.click(await screen.findByRole("button", { name: "测试连接" }));

    expect(
      await screen.findByText("连接测试未完全通过，请检查以下 3 项状态。"),
    ).toBeInTheDocument();
    const statusList = screen.getByRole("list", { name: "连接测试状态" });
    expect(statusList).toBeInTheDocument();
    expect(within(statusList).getByText("聊天")).toBeInTheDocument();
    expect(within(statusList).getByText("检索")).toBeInTheDocument();
    expect(within(statusList).getByText("视觉")).toBeInTheDocument();
  });

  it("shows only self-service sections for non-admin users without loading system settings", async () => {
    renderSettingsPage(buildAppUser("user"), "/settings/preferences");

    expect(await screen.findByRole("heading", { name: "偏好与外观" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "主 Provider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "系统提示词" })).not.toBeInTheDocument();
    expect(settingsApi.getSettings).not.toHaveBeenCalled();
  });

  it("renders management entry action for admins with the expected route", async () => {
    renderSettingsPage(buildAppUser("admin"), "/settings/management");

    expect(await screen.findByRole("heading", { name: "用户管理" })).toBeInTheDocument();
    const managementLink = screen.getByRole("link", { name: "前往用户管理" });
    expect(managementLink).toHaveAttribute("href", "/admin/users");
  });
});
