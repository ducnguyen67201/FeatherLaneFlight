import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import type {
  SaveDomainRuleRequest,
  SaveEmailGrantRequest,
} from "@featherlane/contracts";
import {
  zSaveDomainRuleRequest,
  zSaveEmailGrantRequest,
} from "@featherlane/contracts/validators";

type Props = {
  kind: "email" | "domain";
  value: string;
  onValueChange: (value: string) => void;
  organizationName: string;
  onClose: () => void;
  onSaveEmail: (body: SaveEmailGrantRequest) => Promise<void>;
  onSaveDomain: (body: SaveDomainRuleRequest) => Promise<void>;
  onSaved: (message: string) => void;
};

export function AdmissionDialog({
  kind,
  value,
  onValueChange,
  organizationName,
  onClose,
  onSaveEmail,
  onSaveDomain,
  onSaved,
}: Props) {
  const [validation, setValidation] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const email = kind === "email";
  function validate() {
    const normalized = value.trim().toLowerCase();
    const valid = email
      ? zSaveEmailGrantRequest.safeParse({ email: normalized }).success &&
        normalized.indexOf("@") <= 64
      : zSaveDomainRuleRequest.safeParse({ domain: normalized }).success;
    const message = valid
      ? ""
      : email
        ? "Enter a complete email address, such as name@example.org."
        : "Enter a domain only, such as testcompany.com. No @, URL or wildcard.";
    setValidation(message);
    return valid;
  }
  async function save() {
    if (saving.current) return;
    if (!validate()) {
      input.current?.focus();
      return;
    }
    saving.current = true;
    setPending(true);
    setFailed(false);
    const normalized = value.trim().toLowerCase();
    try {
      if (email) await onSaveEmail({ email: normalized });
      else await onSaveDomain({ domain: normalized });
      onSaved(
        email
          ? `Email saved. ${normalized} will join on their next sign-in with this verified email.`
          : `Rule saved. Verified @${normalized} accounts will join on their next sign-in.`,
      );
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
      aria-labelledby="admission-title"
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <DialogTitle id="admission-title">
          {email ? "Add by email" : "Add a domain rule"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={5} sx={{ pt: 2 }}>
            {failed && (
              <Alert severity="error">
                Changes could not be saved. Your entry is preserved. Retry, or
                cancel and reload the page to check the current rules.
              </Alert>
            )}
            <DialogContentText>
              {email
                ? `Save an email now. Whether or not they have an account, they’ll join ${organizationName} on their next sign-in with this verified email. No acceptance is needed.`
                : `Anyone who signs in with a verified email at this exact domain will automatically join ${organizationName}.`}
            </DialogContentText>
            <TextField
              autoFocus
              inputRef={input}
              fullWidth
              required
              label={email ? "Email address" : "Email domain"}
              placeholder={email ? "name@example.org" : "testcompany.com"}
              value={value}
              disabled={pending}
              onChange={(e) => {
                onValueChange(e.target.value);
                setValidation("");
              }}
              onBlur={() => {
                if (value) validate();
              }}
              error={Boolean(validation)}
              helperText={
                validation ||
                (email
                  ? "The email is saved even if no account exists yet."
                  : "Enter a domain without @ or https://. Subdomains are excluded.")
              }
              slotProps={{
                htmlInput: {
                  autoComplete: "off",
                  autoCapitalize: "none",
                  spellCheck: false,
                },
              }}
            />
            <Alert severity="info">
              Organization membership only. Project access is assigned
              separately.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5, pt: 3 }}>
          <Button color="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={pending}
            startIcon={
              pending ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {pending
              ? "Saving…"
              : failed
                ? "Retry save"
                : email
                  ? "Save email"
                  : "Save domain rule"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
