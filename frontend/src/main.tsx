import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
// Bundled rather than pulled from the Google Fonts CDN, so the app makes no
// external request at runtime and renders identically offline. The italic cut
// is imported separately because only the wordmark uses it.
import "@fontsource-variable/syne";
import "@fontsource-variable/chivo";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
