// Starts a field test in a Web Worker. A module worker served from the app's own
// origin ('self'), so it runs under the production CSP (worker-src 'self' blob:) on
// the web and in Electron alike. Tests replace this module (jsdom has no workers).
import type { FieldTestInput, FieldTestResult } from "./fieldTest";
import type { FieldTestMessage } from "./fieldTest.worker";

export interface FieldTestRun {
  result: Promise<FieldTestResult>;
  cancel: () => void;
}

export class FieldTestCancelled extends Error {
  constructor() {
    super("Field test cancelled");
    this.name = "FieldTestCancelled";
  }
}

export function startFieldTest(input: FieldTestInput, onProgress: (done: number, total: number) => void): FieldTestRun {
  const worker = new Worker(new URL("./fieldTest.worker.ts", import.meta.url), { type: "module", name: "field-test" });
  let settle: { resolve: (result: FieldTestResult) => void; reject: (error: Error) => void } | null = null;
  const result = new Promise<FieldTestResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = (outcome: { result: FieldTestResult } | { error: Error }) => {
    worker.terminate();
    if (!settle) return;
    if ("result" in outcome) settle.resolve(outcome.result);
    else settle.reject(outcome.error);
    settle = null;
  };
  worker.onmessage = (event: MessageEvent<FieldTestMessage>) => {
    const message = event.data;
    if (message.type === "progress") onProgress(message.done, message.total);
    else if (message.type === "done") finish({ result: message.result });
    else finish({ error: new Error(message.message) });
  };
  worker.onerror = (event) => {
    event.preventDefault();
    finish({ error: new Error(event.message || "the field test could not start") });
  };
  worker.postMessage(input);
  return { result, cancel: () => finish({ error: new FieldTestCancelled() }) };
}
