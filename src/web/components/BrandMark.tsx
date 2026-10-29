import Box from "@mui/material/Box";
import { tokens } from "../design/theme";

const markUrl = new URL("../assets/brand/mark.svg", import.meta.url).href;

export function BrandMark() {
  return (
    <Box
      component="img"
      src={markUrl}
      alt=""
      aria-hidden="true"
      sx={{
        display: "block",
        width: tokens.spacing.unitPx * 8,
        height: tokens.spacing.unitPx * 8,
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
  );
}
