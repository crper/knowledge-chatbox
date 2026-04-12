import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test/query-client";
import { buildAppUser } from "@/test/fixtures/app";
import { TestRouter } from "@/test/test-router";
import { server } from "@/test/msw";
import { createChatHandlers } from "@/test/msw/handlers/chat";
import { createAuthHandlers } from "@/test/msw/handlers/auth";
import { useAppShellLayoutController } from "./use-app-shell-layout-controller";

function ControllerHost() {
  const controller = useAppShellLayoutController();

  return (
    <div>
      <div data-testid="is-chat-route">{String(controller.isChatRoute)}</div>
      <div data-testid="is-settings-route">{String(controller.isSettingsRoute)}</div>
      <div data-testid="is-mobile">{String(controller.isMobile)}</div>
      <div data-testid="search-value">{controller.searchValue}</div>
      <div data-testid="is-mobile-navigation-open">{String(controller.isMobileNavigationOpen)}</div>
      <div data-testid="is-mobile-context-open">{String(controller.isMobileContextOpen)}</div>
      <div data-testid="chat-desktop-grid-template">{controller.chatDesktopGridTemplate}</div>
      <div data-testid="sidebar-collapsed">
        {String(controller.chatWorkspacePanels.leftCollapsed)}
      </div>
      <div data-testid="create-session-pending">{String(controller.createSessionPending)}</div>
      <button onClick={() => controller.setSearchValue("test search")} type="button">
        set-search
      </button>
      <button onClick={() => controller.setIsMobileNavigationOpen(true)} type="button">
        open-navigation
      </button>
      <button onClick={() => controller.setIsMobileContextOpen(true)} type="button">
        open-context
      </button>
      <button onClick={() => controller.expandLeftSidebar()} type="button">
        expand-sidebar
      </button>
      <button onClick={controller.handleCreateSession} type="button">
        create-session
      </button>
    </div>
  );
}

function renderWithRouter(pathname = "/chat") {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <TestRouter initialEntry={pathname}>
        <ControllerHost />
      </TestRouter>
    </QueryClientProvider>,
  );
}

describe("useAppShellLayoutController", () => {
  describe("路由状态", () => {
    it("正确识别聊天路由", async () => {
      renderWithRouter("/chat");
      expect(await screen.findByTestId("is-chat-route")).toHaveTextContent("true");
      expect(screen.getByTestId("is-settings-route")).toHaveTextContent("false");
    });

    it("正确识别设置路由", async () => {
      renderWithRouter("/settings");
      expect(await screen.findByTestId("is-chat-route")).toHaveTextContent("false");
      expect(screen.getByTestId("is-settings-route")).toHaveTextContent("true");
    });

    it("正确识别其他路由", async () => {
      renderWithRouter("/knowledge");
      expect(await screen.findByTestId("is-chat-route")).toHaveTextContent("false");
      expect(screen.getByTestId("is-settings-route")).toHaveTextContent("false");
    });
  });

  describe("状态管理", () => {
    it("正确管理搜索值", async () => {
      renderWithRouter();
      expect(await screen.findByTestId("search-value")).toHaveTextContent("");

      fireEvent.click(screen.getByRole("button", { name: "set-search" }));
      expect(screen.getByTestId("search-value")).toHaveTextContent("test search");
    });

    it("正确管理移动端导航状态", async () => {
      renderWithRouter();
      expect(await screen.findByTestId("is-mobile-navigation-open")).toHaveTextContent("false");

      fireEvent.click(screen.getByRole("button", { name: "open-navigation" }));
      expect(screen.getByTestId("is-mobile-navigation-open")).toHaveTextContent("true");
    });

    it("正确管理移动端上下文状态", async () => {
      renderWithRouter();
      expect(await screen.findByTestId("is-mobile-context-open")).toHaveTextContent("false");

      fireEvent.click(screen.getByRole("button", { name: "open-context" }));
      expect(screen.getByTestId("is-mobile-context-open")).toHaveTextContent("true");
    });
  });

  describe("侧边栏状态", () => {
    it("默认展开左侧边栏", async () => {
      renderWithRouter();
      expect(await screen.findByTestId("sidebar-collapsed")).toHaveTextContent("false");
    });

    it("展开左侧边栏", async () => {
      renderWithRouter();
      await screen.findByTestId("sidebar-collapsed");
      fireEvent.click(screen.getByRole("button", { name: "expand-sidebar" }));
      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("false");
    });

    it("生成正确的桌面端网格模板", async () => {
      renderWithRouter();
      expect(await screen.findByTestId("chat-desktop-grid-template")).toHaveTextContent(
        "4.75rem minmax(14.5rem, 17rem) minmax(0, 1fr) minmax(17rem, 19rem)",
      );
    });
  });

  describe("创建会话", () => {
    it("创建会话时设置 pending 状态", async () => {
      server.use(
        ...createChatHandlers({
          sessions: [],
        }),
        ...createAuthHandlers({
          user: buildAppUser("admin"),
          authenticated: true,
        }),
      );

      renderWithRouter();

      expect(await screen.findByTestId("create-session-pending")).toHaveTextContent("false");

      fireEvent.click(screen.getByRole("button", { name: "create-session" }));

      await waitFor(
        () => {
          expect(screen.getByTestId("create-session-pending")).toHaveTextContent("true");
        },
        { timeout: 1000 },
      );
    });
  });

  describe("Cmd/Ctrl+B 快捷键", () => {
    it("在聊天路由且非移动端时，Cmd+B 切换侧边栏", async () => {
      renderWithRouter("/chat");
      await screen.findByTestId("sidebar-collapsed");

      fireEvent.keyDown(document, {
        key: "b",
        metaKey: true,
      });

      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("true");
    });

    it("在聊天路由且非移动端时，Ctrl+B 切换侧边栏", async () => {
      renderWithRouter("/chat");
      await screen.findByTestId("sidebar-collapsed");

      fireEvent.keyDown(document, {
        key: "b",
        ctrlKey: true,
      });

      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("true");
    });

    it("忽略其他修饰键组合", async () => {
      renderWithRouter("/chat");
      await screen.findByTestId("sidebar-collapsed");

      fireEvent.keyDown(document, {
        key: "b",
        metaKey: true,
        shiftKey: true,
      });

      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("false");

      fireEvent.keyDown(document, {
        key: "b",
        metaKey: true,
        altKey: true,
      });

      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("false");
    });

    it("在可编辑元素中忽略快捷键", async () => {
      renderWithRouter("/chat");
      await screen.findByTestId("sidebar-collapsed");

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(input, {
        key: "b",
        metaKey: true,
      });

      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("false");

      document.body.removeChild(input);
    });

    it("在非聊天路由时忽略快捷键", async () => {
      renderWithRouter("/knowledge");
      await screen.findByTestId("sidebar-collapsed");

      fireEvent.keyDown(document, {
        key: "b",
        metaKey: true,
      });

      expect(screen.getByTestId("sidebar-collapsed")).toHaveTextContent("false");
    });
  });
});
