import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import { theme } from "./design/theme";
import { FoundationReference } from "./app/FoundationReference";

const root = document.getElementById("root");
if (!root) throw new Error("The web entry document is missing #root.");

createRoot(root).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <FoundationReference />
  </ThemeProvider>,
);
