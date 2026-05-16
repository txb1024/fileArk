import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 禁用默认右键菜单（WebView2 右键菜单）
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

// 生产环境屏蔽开发者工具相关快捷键（F12、Ctrl+Shift+I/J/C、Ctrl+U）
if (import.meta.env.PROD) {
  window.addEventListener(
    "keydown",
    (e) => {
      const key = e.key;
      if (key === "F12") {
        e.preventDefault();
        return;
      }
      const upper = key.length === 1 ? key.toUpperCase() : key;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (upper === "I" || upper === "J" || upper === "C")) {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && upper === "U") {
        e.preventDefault();
      }
    },
    { capture: true }
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
