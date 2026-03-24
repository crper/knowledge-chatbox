import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AppProviders } from "@/providers/app-providers";
import type { AppSettings } from "../api/settings";
import { SystemPromptForm } from "./system-prompt-form";

function buildSettings(initialPrompt = "Existing prompt"): AppSettings {
  return {
    active_index_generation: 1,
    building_index_generation: null,
    embedding_route: { provider: "openai", model: "text-embedding-3-small" },
    id: 1,
    index_rebuild_status: "idle",
    pending_embedding_route: null,
    provider_profiles: {
      anthropic: { api_key: null, base_url: null, chat_model: null, vision_model: null },
      ollama: { base_url: "http://localhost:11434", chat_model: "qwen3.5:4b" },
      openai: {
        api_key: "********",
        base_url: "https://api.openai.com/v1",
        chat_model: "gpt-5.4",
        embedding_model: "text-embedding-3-small",
        vision_model: "gpt-5.4",
      },
      voyage: { api_key: null, base_url: null, embedding_model: "voyage-3.5" },
    },
    provider_timeout_seconds: 60,
    response_route: { provider: "openai", model: "gpt-5.4" },
    system_prompt: initialPrompt,
    vision_route: { provider: "openai", model: "gpt-5.4" },
  };
}

describe("SystemPromptForm", () => {
  it("allows saving an empty system prompt and keeps success notice until the next edit", async () => {
    const onSave = vi.fn().mockResolvedValue(buildSettings(""));

    render(
      <AppProviders>
        <SystemPromptForm initialValues={buildSettings()} onSave={onSave} />
      </AppProviders>,
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "系统提示词" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ system_prompt: "" });
    });

    expect(await screen.findByText("设置已保存")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "系统提示词" }), {
      target: { value: "Changed prompt" },
    });

    await waitFor(() => {
      expect(screen.queryByText("设置已保存")).not.toBeInTheDocument();
    });
  });

  it("keeps the failure notice visible until the next edit", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("设置保存失败"));

    render(
      <AppProviders>
        <SystemPromptForm initialValues={buildSettings()} onSave={onSave} />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "保存设置" }));

    expect(await screen.findByText("设置保存失败")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "系统提示词" }), {
      target: { value: "Retry prompt" },
    });

    await waitFor(() => {
      expect(screen.queryByText("设置保存失败")).not.toBeInTheDocument();
    });
  });
});
