import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import type { AppUser } from "@/lib/api/client";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { http } from "msw";
import { apiResponse, overrideHandler } from "@/test/msw";
import { createTestQueryClient } from "@/test/query-client";
import { ChatSidebar } from "./chat-sidebar";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(
    (options: {
      count?: number;
      getScrollElement?: () => HTMLElement | null;
      estimateSize?: (index: number) => number;
      overscan?: number;
    }) => {
      const count = options.count ?? 0;

      return {
        getVirtualItems: () =>
          Array.from({ length: count }, (_, index) => ({
            index,
            start: index * 72,
            size: 72,
            key: index,
          })),
        getTotalSize: () => count * 72,
        scrollToIndex: vi.fn(),
      };
    },
  ),
}));

function buildUser(): AppUser {
  return {
    id: 1,
    username: "admin",
    role: "admin",
    status: "active",
    theme_preference: "system",
  };
}

function renderSidebar(initialEntry = "/chat/1") {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <div style={{ height: "640px", width: "320px" }}>
              <ChatSidebar
                onCreateSession={vi.fn().mockResolvedValue(undefined)}
                onLogout={vi.fn().mockResolvedValue(undefined)}
                pathname={initialEntry}
                searchValue=""
                setSearchValue={vi.fn()}
                user={buildUser()}
              />
            </div>
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("ChatSidebar virtuoso integration", () => {
  it("renders a short session list without producing empty probe rows", async () => {
    overrideHandler(
      http.get("*/api/chat/sessions", () => {
        return apiResponse([{ id: 1, title: "Session A" }]);
      }),
    );

    renderSidebar();

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    expect(screen.getByTestId("chat-sidebar-virtuoso")).toBeInTheDocument();
  });
});
