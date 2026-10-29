import type { ReactNode } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";

export type AccessPagination = {
  onPrevious?: () => void;
  onNext?: () => void;
  pending?: boolean;
};

export function AccessSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={4}
        sx={{
          p: 5,
          alignItems: { sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography component="h2" variant="h2">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

export function AccessPageNavigation({
  onPrevious,
  onNext,
  pending,
  disabled,
}: AccessPagination & { disabled?: boolean }) {
  if (!onPrevious && !onNext) return null;
  return (
    <Stack
      direction="row"
      spacing={3}
      sx={{ p: 4, justifyContent: "flex-end" }}
      aria-label="Page navigation"
    >
      <Button
        variant="outlined"
        disabled={disabled || pending || !onPrevious}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <Button
        variant="outlined"
        disabled={disabled || pending || !onNext}
        onClick={onNext}
      >
        {pending ? "Loading…" : "Next"}
      </Button>
    </Stack>
  );
}
