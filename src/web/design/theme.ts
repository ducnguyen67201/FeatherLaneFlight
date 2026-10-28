import { createTheme } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";
import type { CSSProperties } from "react";
import tokens from "../../../design-tokens.json";

declare module "@mui/material/styles" {
  interface Palette {
    status: typeof tokens.color.status;
  }
  interface PaletteOptions {
    status?: typeof tokens.color.status;
  }
  interface TypographyVariants {
    display: CSSProperties;
    code: CSSProperties;
  }
  interface TypographyVariantsOptions {
    display?: CSSProperties;
    code?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    display: true;
    code: true;
  }
}

export { tokens };
const { color: c, component, typography: type } = tokens;
const variant = (name: keyof typeof type.variant) => {
  const v = type.variant[name];
  const weights: Readonly<Record<string, number>> = type.weight;
  const fontWeight = weights[v.weight];
  if (fontWeight === undefined)
    throw new Error(`Unknown typography weight: ${v.weight}`);
  return {
    fontSize: `${v.fontSizePx / 16}rem`,
    lineHeight: v.lineHeightPx / v.fontSizePx,
    fontWeight,
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
    display: variant("display"),
    code: { ...variant("code"), fontFamily: type.fontFamily.mono },
  },
  transitions: {
    duration: {
      shortest: tokens.motion.durationMs.fast,
      shorter: tokens.motion.durationMs.fast,
      short: tokens.motion.durationMs.normal,
      standard: tokens.motion.durationMs.normal,
      complex: tokens.motion.durationMs.overlay,
      enteringScreen: tokens.motion.durationMs.overlay,
      leavingScreen: tokens.motion.durationMs.overlay,
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
          top: tokens.spacing.scalePx[2],
          left: tokens.spacing.scalePx[2],
          zIndex: "calc(var(--mui-zIndex-tooltip) + 1)",
          padding: tokens.spacing.scalePx[3],
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
          "&.MuiButton-contained.MuiButton-colorPrimary:not(.Mui-disabled)": {
            "&:hover": { backgroundColor: c.brand.hover },
            "&:active": { backgroundColor: c.brand.pressed },
          },
          [`@media (max-width:${tokens.breakpointPx.md - 0.05}px)`]: {
            minHeight: component.controlHeightPx.touch,
          },
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
        input: {
          padding: `${(component.controlHeightPx.desktop - type.variant.bodyCompact.lineHeightPx) / 2}px ${tokens.spacing.scalePx[3]}px`,
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { color: c.text.secondary } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0 } } },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: `${tokens.spacing.scalePx[3]}px ${tokens.spacing.scalePx[4]}px`,
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
          border: `${tokens.borderWidthPx.default}px solid ${c.border.subtle}`,
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
          border: `${tokens.borderWidthPx.default}px solid ${c.border.subtle}`,
          boxShadow: tokens.shadow.overlay,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: c.surface.raised,
          color: c.text.primary,
          border: `${tokens.borderWidthPx.default}px solid ${c.border.control}`,
          ...variant("caption"),
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radiusPx.compact,
          height: "auto",
          minHeight:
            type.variant.bodyCompact.lineHeightPx + tokens.spacing.unitPx * 2,
        },
        label: { whiteSpace: "normal", paddingBlock: tokens.spacing.unitPx },
      },
    },
  },
});
