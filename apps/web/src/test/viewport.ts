/**
 * @file 测试用视口 helper。
 */

function createMatchMediaMock(matchesResolver: (query: string) => boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: matchesResolver(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

export function mockDesktopViewport(width = 1280) {
  setViewportWidth(width);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: createMatchMediaMock(() => false),
  });
}

export function mockMobileViewport(width = 390) {
  setViewportWidth(width);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: createMatchMediaMock((query) => query.includes("767px")),
  });
}
