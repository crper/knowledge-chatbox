import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import type { AppUser } from "@/lib/api/client";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { jsonResponse } from "@/test/http";
import { createTestQueryClient } from "@/test/query-client";
import { ChatSidebar } from "./chat-sidebar";

vi.mock("react-virtuoso", async () => {
  const Virtuoso = ({
    data = [],
    initialItemCount,
    itemContent,
  }: {
    data?: Array<{ id: number; title: string | null }>;
    initialItemCount?: number;
    itemContent?: (index: number, item: { id: number; title: string | null }) => React.ReactNode;
  }) => {
    const renderCount = Math.max(data.length, initialItemCount ?? 0);
    const items = Array.from({ length: renderCount }, (_, index) =>
      itemContent?.(index, data[index]!),
    );

    if (items.some((item) => item == null)) {
      throw new Error("Virtuoso received an empty session row.");
    }

    return <div data-testid="chat-sidebar-virtuoso">{items}</div>;
  };

  return { Virtuoso };
});

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a short session list without producing empty probe rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input.endsWith("/api/chat/sessions")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [{ id: 1, title: "Session A" }],
              error: null,
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
      }),
    );

    renderSidebar();

    expect(await screen.findByRole("link", { name: "Session A" })).toBeInTheDocument();
    expect(screen.getByTestId("chat-sidebar-virtuoso")).toBeInTheDocument();
  });
});
