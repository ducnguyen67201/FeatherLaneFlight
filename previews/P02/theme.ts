// Preview only. The production adapter is gated on approval of this reference.
import { createTheme } from "@mui/material/styles";
import tokens from "../../design-tokens.json";

declare module "@mui/material/styles" {
  interface Palette {
    status: typeof tokens.color.status;
  }
  interface PaletteOptions {
    status?: typeof tokens.color.status;
  }
}

export { tokens };
const { color: c, component, typography: type } = tokens;
const variant = (name: keyof typeof type.variant) => {
  const v = type.variant[name];
  return {
    fontSize: `${v.fontSizePx / 16}rem`,
    lineHeight: v.lineHeightPx / v.fontSizePx,
    fontWeight: type.weight[v.weight as keyof typeof type.weight],
  };
};
const focus = {
  outline: `${tokens.borderWidthPx.focus}px solid ${c.focus.ring}`,
  outlineOffset: tokens.focusOffsetPx,
};

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark",
    primary: { main: c.brand.default, contrastText: c.text.onBrand },
    secondary: { main: c.text.primary },
    background: { default: c.surface.canvas, paper: c.surface.panel },
    text: {
      primary: c.text.primary,
      secondary: c.text.secondary,
      disabled: c.text.disabled,
    },
    divider: c.border.subtle,
    action: {
      hover: c.surface.hover,
      selected: c.surface.selected,
      disabled: c.text.disabled,
      disabledBackground: c.surface.disabled,
    },
    success: { main: c.status.success.foreground },
    error: { main: c.status.failure.foreground },
    warning: { main: c.status.warning.foreground },
    info: { main: c.status.pending.foreground },
    status: c.status,
  },
  spacing: tokens.spacing.unitPx,
  shape: { borderRadius: tokens.radiusPx.default },
  breakpoints: { values: tokens.breakpointPx },
  typography: {
    fontFamily: type.fontFamily.sans,
    h1: variant("pageTitle"),
    h2: variant("sectionTitle"),
    h3: variant("body"),
    body1: variant("body"),
    body2: variant("bodyCompact"),
    caption: variant("caption"),
    button: { ...variant("button"), textTransform: "none" },
  },
  transitions: {
    duration: {
      shortest: tokens.motion.durationMs.fast,
      short: tokens.motion.durationMs.normal,
      standard: tokens.motion.durationMs.overlay,
    },
    easing: { easeInOut: tokens.motion.easing },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { margin: 0 },
        "*:focus-visible, .MuiButtonBase-root:focus-visible, .MuiButtonBase-root.Mui-focusVisible":
          focus,
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animation: "none !important",
            transition: "none !important",
            scrollBehavior: "auto !important",
          },
        },
        ".skip-link": {
          position: "fixed",
          top: 8,
          left: 8,
          zIndex: 1600,
          padding: 12,
          background: c.brand.default,
          color: c.text.onBrand,
          transform: "translateY(-200%)",
          "&:focus": { transform: "none" },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: component.controlHeightPx.desktop,
          textTransform: component.buttonTextTransform,
          [`@media (max-width:${tokens.breakpointPx.md - 0.05}px)`]: {
            minHeight: component.controlHeightPx.touch,
          },
        },
        contained: {
          "&:hover": { backgroundColor: c.brand.hover },
          "&:active": { backgroundColor: c.brand.pressed },
        },
        outlined: {
          borderColor: c.border.control,
          "&:hover": {
            borderColor: c.border.hover,
            backgroundColor: c.surface.hover,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: component.minTouchTargetPx,
          minHeight: component.minTouchTargetPx,
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none", boxShadow: tokens.shadow.panel },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: component.controlHeightPx.desktop,
          "&.Mui-focused": focus,
          [`@media (max-width:${tokens.breakpointPx.md - 0.05}px)`]: {
            minHeight: component.controlHeightPx.touch,
          },
        },
        notchedOutline: { borderColor: c.border.control },
        input: { padding: "10px 12px" },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { color: c.text.secondary } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0 } } },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: "12px 16px",
          borderColor: c.border.subtle,
          ...variant("bodyCompact"),
        },
        head: {
          color: c.text.secondary,
          fontWeight: type.weight.medium,
          backgroundColor: c.surface.raised,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: { root: { minHeight: component.tableRowMinHeightPx } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: component.minTouchTargetPx,
          borderRadius: tokens.radiusPx.default,
          "&.Mui-selected": {
            color: c.brand.default,
            backgroundColor: c.surface.selected,
          },
          "&.Mui-selected:hover": { backgroundColor: c.surface.selected },
        },
      },
    },
    MuiTabs: {
      styleOverrides: { root: { minHeight: component.minTouchTargetPx } },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", minHeight: component.minTouchTargetPx },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surface.raised,
          border: `1px solid ${c.border.subtle}`,
          boxShadow: tokens.shadow.overlay,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { whiteSpace: "normal", minHeight: component.minTouchTargetPx },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surface.raised,
          border: `1px solid ${c.border.subtle}`,
          boxShadow: tokens.shadow.overlay,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: c.surface.raised,
          color: c.text.primary,
          border: `1px solid ${c.border.control}`,
          ...variant("caption"),
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radiusPx.compact,
          height: "auto",
          minHeight: 28,
        },
        label: { whiteSpace: "normal", paddingBlock: 4 },
      },
    },
  },
});
