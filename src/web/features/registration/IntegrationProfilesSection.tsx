import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";
import type { RegisteredIntegrationProfileView } from "@featherlane/contracts";
import {
  CatalogPagination,
  type CatalogPaginationProps,
} from "./CatalogPagination";

type IntegrationProfilesSectionProps = {
  profiles: readonly RegisteredIntegrationProfileView[];
  pagination: CatalogPaginationProps;
  onOpen: (id: string) => void;
};

export function IntegrationProfilesSection({
  profiles,
  pagination,
  onOpen,
}: IntegrationProfilesSectionProps) {
  return (
    <>
      <Typography
        component="h2"
        variant="body1"
        sx={{ fontWeight: 600, px: 4, pt: 4 }}
      >
        Integration specifications
      </Typography>
      {profiles.length === 0 ? (
        <Typography sx={{ p: 4 }} color="text.secondary">
          No registered integration specifications yet.
        </Typography>
      ) : (
        profiles.map((profile) => (
          <Stack
            key={profile.id}
            direction={{ xs: "column", sm: "row" }}
            spacing={4}
            sx={{
              p: 4,
              justifyContent: "space-between",
              alignItems: { sm: "center" },
            }}
          >
            <Box>
              <Typography variant="body2">
                {profile.name} · revision {profile.revision}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {profile.simulator} ·{" "}
                {profile.runtimeFamily === "SYNTHETIC"
                  ? "synthetic observations"
                  : profile.vehicle}{" "}
                · {profile.speedFactor}× · fixed seed
              </Typography>
            </Box>
            <Chip
              variant="outlined"
              label={
                profile.runtimeFamily === "SYNTHETIC"
                  ? "Synthetic · declared"
                  : "Declared · qualification pending"
              }
            />
            <Button
              size="small"
              color="secondary"
              aria-label={`Open ${profile.name} specification`}
              onClick={() => onOpen(profile.id)}
            >
              Open specification{" "}
              <ArrowForward fontSize="small" sx={{ ml: 1 }} />
            </Button>
          </Stack>
        ))
      )}
      <CatalogPagination {...pagination} />
    </>
  );
}
