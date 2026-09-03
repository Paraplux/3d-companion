import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "@/hooks/useTheme";
import { applyResolvedTheme, readStoredTheme, resolveTheme } from "@/lib/theme";
import "./styles/global.css";

applyResolvedTheme(resolveTheme(readStoredTheme()));

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
