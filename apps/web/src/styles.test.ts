import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type HslTuple = [number, number, number];
type ThemeName = "light" | "dark";

const MIN_CONTRAST_RATIO = 4.5;
const GLOBALS_CSS_PATH = resolve(process.cwd(), "src/styles/globals.css");
const THEME_BLOCK_PATTERNS: Record<ThemeName, RegExp> = {
  light: /:root\s*\{([\s\S]*?)\}/,
  dark: /\.dark,\s*\.dark\s*\{([\s\S]*?)\}/,
};

let cachedGlobalsCss: string | null = null;

function getGlobalsCss() {
  cachedGlobalsCss ??= readFileSync(GLOBALS_CSS_PATH, "utf8");

  return cachedGlobalsCss;
}

function extractThemeBlock(css: string, theme: ThemeName) {
  const match = css.match(THEME_BLOCK_PATTERNS[theme]);

  if (!match) {
    throw new Error(`${theme} theme block not found`);
  }

  return match[1];
}

function getHslToken(block: string, token: string): HslTuple {
  const pattern = new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`);
  const match = block.match(pattern);

  if (!match) {
    throw new Error(`Token ${token} not found`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function hslToRgb([h, s, l]: HslTuple) {
  const hue = h / 360;
  const saturation = s / 100;
  const lightness = l / 100;

  const hueToRgb = (p: number, q: number, t: number) => {
    let value = t;

    if (value < 0) {
      value += 1;
    }
    if (value > 1) {
      value -= 1;
    }
    if (value < 1 / 6) {
      return p + (q - p) * 6 * value;
    }
    if (value < 1 / 2) {
      return q;
    }
    if (value < 2 / 3) {
      return p + (q - p) * (2 / 3 - value) * 6;
    }

    return p;
  };

  if (saturation === 0) {
    return [lightness, lightness, lightness] as const;
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return [hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3)] as const;
}

function getRelativeLuminance([r, g, b]: readonly [number, number, number]) {
  const normalizeChannel = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return 0.2126 * normalizeChannel(r) + 0.7152 * normalizeChannel(g) + 0.0722 * normalizeChannel(b);
}

function getContrastRatio(foreground: HslTuple, background: HslTuple) {
  const fgLuminance = getRelativeLuminance(hslToRgb(foreground));
  const bgLuminance = getRelativeLuminance(hslToRgb(background));
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function expectThemeContrast(theme: ThemeName, foregroundToken: string, backgroundToken: string) {
  const block = extractThemeBlock(getGlobalsCss(), theme);
  if (!block) {
    throw new Error(`Missing theme block for ${theme}`);
  }
  const foreground = getHslToken(block, foregroundToken);
  const background = getHslToken(block, backgroundToken);

  expect(getContrastRatio(foreground, background)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
}

describe("theme styles", () => {
  it("keeps destructive text readable against the light background", () => {
    expectThemeContrast("light", "destructive", "background");
  });

  it("keeps primary button text readable in light mode", () => {
    expectThemeContrast("light", "primary-foreground", "primary");
  });

  it("keeps primary button text readable in dark mode", () => {
    expectThemeContrast("dark", "primary-foreground", "primary");
  });

  it("keeps destructive text readable against the dark background", () => {
    expectThemeContrast("dark", "destructive", "background");
  });
});
