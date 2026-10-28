import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme } from "../../src/web/design/theme";
import { ProjectsDemo } from "../../src/web/mocks/ProjectsDemo";

const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <ProjectsDemo />
  </ThemeProvider>,
);
