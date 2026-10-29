import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Alert from "@mui/material/Alert";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme } from "./design/theme";
import { FoundationReference } from "./app/FoundationReference";
import { RunsWorkspace } from "./features/runs/RunsWorkspace";
import { ProjectsDemo } from "./mocks/ProjectsDemo";
import { startRunsDemo } from "./mocks/browser";

const root = document.getElementById("root");
if (!root) throw new Error("The web entry document is missing #root.");

const appRoot = createRoot(root);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
async function start() {
  try {
    const settings = window.location.pathname === "/settings";
    if (!settings) await startRunsDemo();
    appRoot.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {settings ? (
            <ProjectsDemo />
          ) : window.location.pathname === "/" ||
            /^\/runs(?:\/|$)/.test(window.location.pathname) ? (
            <RunsWorkspace />
          ) : (
            <FoundationReference />
          )}
        </ThemeProvider>
      </QueryClientProvider>,
    );
  } catch {
    appRoot.render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Alert severity="error">
          The local mock workspace could not start. Run workspace setup and
          restart the development server.
        </Alert>
      </ThemeProvider>,
    );
  }
}
void start();
