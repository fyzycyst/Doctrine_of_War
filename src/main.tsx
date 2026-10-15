import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/400-italic.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import { bootFromUrl } from "./app/boot";
import { Root } from "./app/Root";
import "./styles.css";

// Dev-only Look Lab (`?lab=1`): the whole branch is dead code in production builds.
const isLookLab = import.meta.env.DEV && new URLSearchParams(window.location.search).has("lab");
const LookLab = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import("./render/lab/LookLab")).LookLab }))
  : null;

// Dev-only scenario picker and capture fast-forward (`?scenario=emberFord&stage=command`).
const boot = import.meta.env.DEV && !isLookLab ? bootFromUrl(window.location.search) : { still: false, pauseAt: undefined };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isLookLab && LookLab ? (
      <Suspense fallback={null}>
        <LookLab />
      </Suspense>
    ) : (
      <Root still={boot.still} pauseAt={boot.pauseAt} />
    )}
  </React.StrictMode>,
);
