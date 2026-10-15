// The balance suite's setup (npm run test:balance; src/test/suites.ts). Its tests are long
// synchronous simulations. Vitest's worker reports each test's start to the main process over
// RPC with a 60 s timeout, and the reply can only be read when the worker yields to the event
// loop; back-to-back synchronous tests never do, so a file that runs past 60 s of wall time
// (easy under machine load) failed with "Timeout calling onTaskUpdate" though every test
// passed. A short real timer before each test lets the worker read the replies (the I/O poll
// runs while it waits), so only a single test over 60 s could still trip it.
import { beforeEach } from "vitest";

beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
