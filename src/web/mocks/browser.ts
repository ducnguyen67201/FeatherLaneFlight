import { setupWorker } from "msw/browser";
import { createRunsDemo, createRunsHandlers } from "./runsDemo";

import { createRunDetailDemo } from "./runDetailDemo";

export const runsDemo = createRunsDemo();
export const runDetailDemo = createRunDetailDemo(runsDemo);
export async function startRunsDemo() {
  const worker = setupWorker(
    ...runDetailDemo.handlers(window.location.origin),
    ...createRunsHandlers(window.location.origin, runsDemo),
  );
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  return worker;
}
