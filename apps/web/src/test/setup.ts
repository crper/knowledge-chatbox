/**
 * @file 前端模块。
 */

import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

import { LAST_VISITED_CHAT_SESSION_STORAGE_KEY } from "../features/chat/utils/chat-session-recovery";
import { i18n } from "../i18n";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  LANGUAGE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEME_SYNC_ON_LOGIN_STORAGE_KEY,
} from "../lib/config/constants";

configure({
  asyncUtilTimeout: 5000,
});

function createDomRect(width: number, height: number): DOMRectReadOnly {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } satisfies DOMRectReadOnly;
}

function resolveElementSize(element: Element) {
  const htmlElement = element as HTMLElement;
  const rawStyleHeight = htmlElement.style.height || "";
  const rawStyleWidth = htmlElement.style.width || "";
  const styleHeight = rawStyleHeight.endsWith("%")
    ? Number.NaN
    : Number.parseFloat(rawStyleHeight || "");
  const styleWidth = rawStyleWidth.endsWith("%")
    ? Number.NaN
    : Number.parseFloat(rawStyleWidth || "");
  const parentStyleHeight = Number.parseFloat(htmlElement.parentElement?.style.height ?? "");
  const parentStyleWidth = Number.parseFloat(htmlElement.parentElement?.style.width ?? "");

  const height =
    styleHeight || htmlElement.clientHeight || htmlElement.scrollHeight || parentStyleHeight || 48;
  const width = styleWidth || htmlElement.clientWidth || parentStyleWidth || 320;

  return { height, width };
}

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  } satisfies Storage;
}

const localStorageMock = createStorageMock();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

const { useChatComposerStore } = await import("../features/chat/store/chat-composer-store");
const { useUiStore } = await import("../lib/store/ui-store");
const { server } = await import("./msw/server");
const { clearPendingBootstrapPromise } = await import("../lib/auth/session-manager");
const { useSessionStore } = await import("../lib/auth/session-store");

Object.defineProperty(globalThis, "CustomEvent", {
  configurable: true,
  value: window.CustomEvent,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(Element.prototype, "getAnimations", {
  configurable: true,
  value: vi.fn(() => []),
});

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value: function getBoundingClientRect() {
    const { height, width } = resolveElementSize(this);
    return createDomRect(width, height);
  },
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: function scrollTo(options: ScrollToOptions | number, y?: number) {
    if (typeof options === "number") {
      this.scrollTop = y ?? options;
      return;
    }

    this.scrollTop = options.top ?? this.scrollTop ?? 0;
    this.scrollLeft = options.left ?? this.scrollLeft ?? 0;
  },
});

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: vi.fn(() => false),
});

Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: vi.fn(),
});

class ResizeObserverMock {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

ResizeObserverMock.prototype.observe = vi.fn(function observe(
  this: ResizeObserverMock,
  target: Element,
) {
  const { height, width } = resolveElementSize(target);
  this.callback(
    [
      {
        borderBoxSize: [],
        contentBoxSize: [],
        contentRect: createDomRect(width, height),
        devicePixelContentBoxSize: [],
        target,
      } as ResizeObserverEntry,
    ],
    this as unknown as ResizeObserver,
  );
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("fetchMockCalls", [] as Array<[string, RequestInit?]>);
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  window.localStorage.removeItem(LAST_VISITED_CHAT_SESSION_STORAGE_KEY);
  window.sessionStorage?.removeItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY);
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "light";
  useSessionStore.getState().reset();
  clearPendingBootstrapPromise();
  useUiStore.setState({ language: DEFAULT_LANGUAGE, theme: DEFAULT_THEME });
  useChatComposerStore.setState({
    attachmentsBySession: {},
    draftsBySession: {},
    sendShortcut: "enter",
  });
  void i18n.changeLanguage(DEFAULT_LANGUAGE);
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
