/// <reference types="vite/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Service Worker only in production top-level browsing contexts
if (
  "serviceWorker" in navigator &&
  !import.meta.env.DEV &&
  typeof window !== "undefined" &&
  window.self === window.top
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal in restricted/embedded environments
    });
  });
}
