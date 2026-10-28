import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyUiScale, loadUiScale } from "./ui/uiScale";

// T179: the UI scale kept in this browser, before the first paint
applyUiScale(loadUiScale());

// the shadow audit sheet (T141, dev only: ?shadows=audit) draws in place of the game
if (import.meta.env.DEV && new URLSearchParams(location.search).get("shadows") === "audit")
  void import("./game/dev/shadow-audit").then(m => m.startShadowAudit(document.getElementById("root")!));
// the vector shadows' draft run (T142, dev only: ?shadows=draft; scripts/dev/draft-shadows.mjs)
else if (import.meta.env.DEV && new URLSearchParams(location.search).get("shadows") === "draft")
  void import("./game/dev/shadow-draft-page").then(m => m.startShadowDraft(document.getElementById("root")!));
// the car paint audit sheet (T236, dev only: ?carpaint=audit; scripts/dev/car-paint-audit.mjs)
else if (import.meta.env.DEV && new URLSearchParams(location.search).get("carpaint") === "audit")
  void import("./game/dev/car-paint-audit").then(m => m.startCarPaintAudit(document.getElementById("root")!));
else
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
