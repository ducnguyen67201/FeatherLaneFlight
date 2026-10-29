import { Button, Stack, Typography } from "@mui/material";

export type CatalogPaginationProps = {
  page: number;
  hasNext: boolean;
  pending: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function CatalogPagination({
  page,
  hasNext,
  pending,
  onPrevious,
  onNext,
}: CatalogPaginationProps) {
  return (
    <Stack
      direction="row"
      spacing={3}
      sx={{
        p: 4,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        Page {page + 1} ·{" "}
        {hasNext ? "more registrations available" : "no additional pages"}
      </Typography>
      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          disabled={page === 0 || pending}
          onClick={onPrevious}
        >
          Previous
        </Button>
        <Button
          variant="outlined"
          disabled={!hasNext || pending}
          onClick={onNext}
        >
          Next
        </Button>
      </Stack>
    </Stack>
  );
}
