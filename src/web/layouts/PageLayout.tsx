import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronRight from "@mui/icons-material/ChevronRight";
import { tokens } from "../design/theme";

type PageLayoutProps = {
  breadcrumbs: ReactNode[];
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

export function PageLayout({
  breadcrumbs,
  title,
  description,
  eyebrow,
  actions,
  filters,
  children,
}: PageLayoutProps) {
  return (
    <>
      <Breadcrumbs separator={<ChevronRight fontSize="small" />} sx={{ mb: 5 }}>
        {breadcrumbs}
      </Breadcrumbs>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={4}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          mb: `${tokens.layoutPx.sectionGap}px`,
        }}
      >
        <Box>
          {eyebrow && (
            <Typography
              variant="caption"
              color="primary"
              sx={{
                display: "block",
                mb: 2,
                fontWeight: tokens.typography.weight.semibold,
              }}
            >
              {eyebrow}
            </Typography>
          )}
          <Typography component="h1" variant="h1">
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions}
      </Stack>
      {filters && (
        <Box sx={{ mb: `${tokens.layoutPx.sectionGap}px` }}>{filters}</Box>
      )}
      {children}
    </>
  );
}
