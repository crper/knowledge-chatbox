/**
 * @file 应用前端启动入口。
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppShell } from "./app";
import { applyNoTranslateAttributes } from "@/lib/dom/no-translate";
import "./styles/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

applyNoTranslateAttributes([document.documentElement, document.body, rootElement]);

createRoot(rootElement).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
