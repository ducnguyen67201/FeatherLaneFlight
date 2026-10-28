import type { ReactNode } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import FlightOutlined from "@mui/icons-material/FlightOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { tokens } from "../../design/theme";

type AuthPageLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthPageLayout({
  title,
  description,
  children,
}: AuthPageLayoutProps) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Stack
        component="header"
        direction="row"
        spacing={3}
        sx={{
          px: { xs: 4, sm: 8 },
          py: 4,
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <FlightOutlined color="primary" />
        <Typography variant="body1" sx={{ fontWeight: 700 }}>
          FeatherLane
          <Typography component="span" color="primary" sx={{ fontWeight: 700 }}>
            Flight
          </Typography>
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: "auto !important", display: { xs: "none", sm: "block" } }}
        >
          SIMULATION WORKSPACE
        </Typography>
      </Stack>
      <Box
        component="main"
        sx={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          p: { xs: 4, sm: 8 },
          py: 12,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: tokens.layoutPx.formMaxWidth }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "center", mb: 4 }}
          >
            <LockOutlined fontSize="small" color="primary" />
            <Typography variant="caption" color="text.secondary">
              YOUR SIMULATION WORKSPACE
            </Typography>
          </Stack>
          <Paper variant="outlined" sx={{ p: { xs: 6, sm: 8 } }}>
            <Stack spacing={6}>
              <Box aria-live="polite">
                <Typography variant="h1" sx={{ mb: 3 }}>
                  {title}
                </Typography>
                <Typography color="text.secondary">{description}</Typography>
              </Box>
              {children}
            </Stack>
          </Paper>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 4 }}
          >
            Flight software evaluation · Simulation evidence is not a real-world
            safety certification.
          </Typography>
        </Box>
      </Box>
      <Box
        component="footer"
        sx={{
          px: { xs: 4, sm: 8 },
          py: 4,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          FeatherLaneFlight · Private project access
        </Typography>
      </Box>
    </Box>
  );
}
