import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/* the paper travels with the scribe: the PWA worker registers here, at
   the host level — the engine stays honest and defers to its shell.
   file:// skips registration, as the vanilla build always did. */
if (location.protocol === "https:" || location.hostname === "localhost") {
  navigator.serviceWorker?.register("./sw.js").catch(() => null);
}
