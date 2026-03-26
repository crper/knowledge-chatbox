import { MutationObserver } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { buildAppSettings } from "@/test/fixtures/app";
import { createTestQueryClient } from "@/test/query-client";
import { updateSettingsMutationOptions } from "./settings-query";
import * as settingsApi from "./settings";

vi.mock("./settings", async () => {
  const actual = await vi.importActual<typeof import("./settings")>("./settings");

  return {
    ...actual,
    updateSettings: vi.fn(),
  };
});

describe("settings-query", () => {
  it("invalidates settings and chat profile queries after provider settings are saved", async () => {
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(
      buildAppSettings({
        provider_profiles: {
          ollama: {
            base_url: "http://host.docker.internal:11434",
          },
        },
        system_prompt: "prompt",
      }),
    );

    const queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const observer = new MutationObserver(queryClient, updateSettingsMutationOptions(queryClient));

    await observer.mutate({});

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.chat.profile,
    });
  });
});
