import { useEffect, useRef, type FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type CreateProjectDialogProps = {
  open: boolean;
  organizationName: string;
  name: string;
  pending: boolean;
  error: string | null;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onExited: () => void;
};

export function CreateProjectDialog({
  open,
  organizationName,
  name,
  pending,
  error,
  onNameChange,
  onClose,
  onSubmit,
  onExited,
}: CreateProjectDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) nameRef.current?.focus();
  }, [error]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending) onSubmit();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      slotProps={{ transition: { onExited } }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="create-project-title"
    >
      <form onSubmit={submit}>
        <DialogTitle id="create-project-title">Create project</DialogTitle>
        <DialogContent>
          <Stack spacing={5} sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Create in {organizationName}. Projects group your builds, suites,
              and runs.
            </Typography>
            <TextField
              autoFocus
              inputRef={nameRef}
              label="Project name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              disabled={pending}
              error={!!error}
              helperText={error || "Use a clear name, up to 100 characters."}
              slotProps={{
                htmlInput: { maxLength: 100 },
                formHelperText: { role: error ? "alert" : undefined },
              }}
              fullWidth
            />
            {pending && (
              <Typography variant="body2" role="status" color="text.secondary">
                Creating project…
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Creating…" : "Create project"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
