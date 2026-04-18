import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ACPApp } from "./pages/acp/ACPApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ACPApp />
  </StrictMode>,
);
