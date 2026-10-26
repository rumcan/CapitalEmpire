import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// the shadow audit sheet (T141, dev only: ?shadows=audit) draws in place of the game
if (import.meta.env.DEV && new URLSearchParams(location.search).get("shadows") === "audit")
  void import("./game/dev/shadow-audit").then(m => m.startShadowAudit(document.getElementById("root")!));
else
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
