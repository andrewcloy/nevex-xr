import { bootSamsungXrApp } from "./app_shell/bootstrap";
import { mountDomRenderer } from "./renderer/dom_renderer";
import "./renderer/styles.css";

declare global {
  interface Window {
    samsungXrApp?: unknown;
  }
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Missing #app root element.");
  }

  const app = await bootSamsungXrApp();
  const renderer = mountDomRenderer({
    root,
    app,
  });

  window.samsungXrApp = app;

  window.addEventListener(
    "beforeunload",
    () => {
      renderer.dispose();
      void app.dispose();
    },
    { once: true },
  );
}

void main().catch((error: unknown) => {
  const root = document.getElementById("app");
  if (root) {
    root.innerHTML = `
      <main style="padding: 24px; font-family: Segoe UI, sans-serif; color: #f4f8ff; background: #09111f; min-height: 100vh;">
        <h1>Samsung XR Mock App Failed To Start</h1>
        <pre style="white-space: pre-wrap;">${String(error)}</pre>
      </main>
    `;
  }

  throw error;
});
