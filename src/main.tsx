import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Dev-only Look Lab (`?lab=1`): the whole branch is dead code in production builds.
const isLookLab = import.meta.env.DEV && new URLSearchParams(window.location.search).has("lab");
const LookLab = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import("./render/lab/LookLab")).LookLab }))
  : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isLookLab && LookLab ? (
      <Suspense fallback={null}>
        <LookLab />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
