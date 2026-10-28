import { setupWorker } from "msw/browser";
import { createRunsDemo, createRunsHandlers } from "./runsDemo";

export const runsDemo = createRunsDemo();
export async function startRunsDemo() {
  const worker = setupWorker(
    ...createRunsHandlers(window.location.origin, runsDemo),
  );
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  return worker;
}
