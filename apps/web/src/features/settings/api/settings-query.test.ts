import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import { queryKeys } from "@/lib/api/query-keys";
import { buildAppSettings } from "@/test/fixtures/app";
import { createTestQueryClient } from "@/test/query-client";
import { settingsDetailQueryOptions, updateSettingsMutationOptions } from "./settings-query";
import * as settingsApi from "./settings";

vi.mock("./settings", async () => {
  const actual = await vi.importActual<typeof import("./settings")>("./settings");

  return {
    ...actual,
    updateSettings: vi.fn(),
  };
});

describe("settingsDetailQueryOptions", () => {
  it("keeps polling while a background index rebuild is running", () => {
    const options = settingsDetailQueryOptions(true);
    const refetchInterval = options.refetchInterval as
      | ((query: {
          state: { data: ReturnType<typeof buildAppSettings> | undefined };
        }) => number | false)
      | undefined;

    expect(typeof refetchInterval).toBe("function");
    expect(
      refetchInterval?.({
        state: {
          data: buildAppSettings({
            building_index_generation: 4,
            index_rebuild_status: "running",
          }),
        },
      }),
    ).toBe(3000);
  });

  it("stops polling when settings are disabled or the rebuild has settled", () => {
    const runningSettings = buildAppSettings({
      building_index_generation: 4,
      index_rebuild_status: "running",
    });
    const enabledRefetchInterval = settingsDetailQueryOptions(true).refetchInterval as
      | ((query: {
          state: { data: ReturnType<typeof buildAppSettings> | undefined };
        }) => number | false)
      | undefined;
    const disabledRefetchInterval = settingsDetailQueryOptions(false).refetchInterval as
      | ((query: {
          state: { data: ReturnType<typeof buildAppSettings> | undefined };
        }) => number | false)
      | undefined;

    expect(
      enabledRefetchInterval?.({
        state: {
          data: buildAppSettings({
            building_index_generation: null,
            index_rebuild_status: "idle",
          }),
        },
      }),
    ).toBe(false);
    expect(
      disabledRefetchInterval?.({
        state: { data: runningSettings },
      }),
    ).toBe(false);
  });
});

describe("updateSettingsMutationOptions", () => {
  it("invalidates settings and chat profile queries after provider settings are saved", async () => {
    const savedSettings = buildAppSettings({
      provider_profiles: {
        ollama: {
          base_url: "http://host.docker.internal:11434",
        },
      },
      system_prompt: "prompt",
    });
    vi.mocked(settingsApi.updateSettings).mockResolvedValue(savedSettings);

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

    expect(queryClient.getQueryData(queryKeys.settings.detail)).toEqual(savedSettings);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
      refetchType: "none",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.chat.profile,
    });
  });
});
