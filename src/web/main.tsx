import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme } from "./design/theme";
import { AuthenticatedApp } from "./app/AuthenticatedApp";

const root = document.getElementById("root");
if (!root) throw new Error("The web entry document is missing #root.");
const appRoot = createRoot(root);

if (import.meta.env.DEV && import.meta.env.MODE === "demo") {
  void import("./mocks/startDemo").then(({ startDemo }) => startDemo(appRoot));
} else {
  appRoot.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthenticatedApp />
    </ThemeProvider>,
  );
}
