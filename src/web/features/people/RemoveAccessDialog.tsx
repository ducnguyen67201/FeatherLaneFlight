import { useRef, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type {
  DomainRuleView,
  EmailGrantView,
  JoinExclusionView,
  OrganizationPersonView,
} from "@featherlane/contracts";

export type AccessRemoval =
  | { kind: "person"; person: OrganizationPersonView }
  | { kind: "email"; email: EmailGrantView }
  | { kind: "domain"; domain: DomainRuleView }
  | { kind: "exclusion"; exclusion: JoinExclusionView };

const messages = {
  person: {
    title: "Remove organization access?",
    detail:
      "This removes their organization membership, saved email and all project access. Automatic domain rules will not re-add this person. You can allow automatic joining again from Removed people.",
    action: "Remove access",
    success:
      "Access removed. Automatic join rules will not re-add this person.",
  },
  email: {
    title: "Remove saved email?",
    detail:
      "This removes the saved email and prevents automatic joining through domain rules. Existing members and their project access stay unchanged. Remove a joined member separately to revoke their current access.",
    action: "Remove email",
    success:
      "Saved email removed. Automatic joining is excluded; existing members keep their access.",
  },
  domain: {
    title: "Remove domain rule?",
    detail:
      "Future sign-ins will no longer join through this domain rule. Current members and their project access will stay unchanged.",
    action: "Remove rule",
    success: "Domain rule removed. Current members keep their access.",
  },
  exclusion: {
    title: "Allow automatic joining again?",
    detail:
      "This email can join again at sign-in if a saved email or domain rule matches. Previous project access will not be restored.",
    action: "Allow automatic joining",
    success:
      "Automatic joining allowed. Previous membership and project access have not been restored.",
  },
};

export function RemoveAccessDialog({
  target,
  onClose,
  onConfirm,
  onRemoved,
}: {
  target: AccessRemoval;
  onClose: () => void;
  onConfirm: (target: AccessRemoval) => Promise<void>;
  onRemoved: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const restore = target.kind === "exclusion";
  const message = messages[target.kind];
  const label =
    target.kind === "person"
      ? target.person.user.email
      : target.kind === "email"
        ? target.email.email
        : target.kind === "domain"
          ? target.domain.domain
          : target.exclusion.email;
  async function confirm() {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onConfirm(target);
      onRemoved(message.success);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!saving.current) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="remove-access-title"
    >
      <DialogTitle id="remove-access-title">{message.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={4}>
          {failed && (
            <Alert severity="error">
              Changes could not be saved. Retry, or cancel and reload the page
              to check the current state.
            </Alert>
          )}
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
          >
            {label}
          </Typography>
          <DialogContentText>{message.detail}</DialogContentText>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5, pt: 3 }}>
        <Button color="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={restore ? "primary" : "error"}
          disabled={pending}
          onClick={() => void confirm()}
          startIcon={
            pending ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          {pending ? "Saving…" : failed ? "Retry change" : message.action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
