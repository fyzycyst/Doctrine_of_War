// The "Test in the field" worker (T16): runs the pure field test off the main thread,
// posting progress after every run. Cancelling terminates the worker.
import { runFieldTest, type FieldTestInput } from "./fieldTest";

export type FieldTestMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; result: ReturnType<typeof runFieldTest> }
  | { type: "error"; message: string };

const post = (message: FieldTestMessage) => self.postMessage(message);

self.onmessage = (event: MessageEvent<FieldTestInput>) => {
  try {
    const result = runFieldTest(event.data, (done, total) => post({ type: "progress", done, total }));
    post({ type: "done", result });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : "the field test failed" });
  }
};
