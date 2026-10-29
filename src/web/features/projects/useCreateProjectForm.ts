import { useEffect, useRef, useState } from "react";
import { ApiError } from "@featherlane/contracts";
import { zProjectView } from "@featherlane/contracts/validators";

type CreationRequest = {
  name: string;
  key: string;
  pending: boolean;
  uncertain: boolean;
};

export function useCreateProjectForm(
  organizationId: string | null,
  onCreate: (
    organizationId: string,
    name: string,
    key: string,
  ) => Promise<void>,
) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Unresolved operations survive closing and organization switches while mounted.
  const requests = useRef(new Map<string, CreationRequest>());
  const active = useRef(true);
  const currentOrganization = useRef(organizationId);
  currentOrganization.current = organizationId;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const saved = organizationId
      ? requests.current.get(organizationId)
      : undefined;
    setOpen(false);
    setName(saved?.uncertain || saved?.pending ? saved.name : "");
    setPending(saved?.pending ?? false);
    setUncertain(saved?.uncertain ?? false);
    setError(null);
  }, [organizationId]);

  function start() {
    if (!organizationId) return;
    const saved = requests.current.get(organizationId);
    if (saved?.pending) return;
    if (!saved?.uncertain) requests.current.delete(organizationId);
    setName(saved?.uncertain ? saved.name : "");
    setUncertain(saved?.uncertain ?? false);
    setError(null);
    setOpen(true);
  }
  function close() {
    if (!organizationId || !requests.current.get(organizationId)?.pending)
      setOpen(false);
  }
  async function submit() {
    if (!organizationId) return;
    const saved = requests.current.get(organizationId);
    if (saved?.pending) return;
    const trimmed = saved?.uncertain ? saved.name : name.trim();
    if (!zProjectView.shape.name.safeParse(trimmed).success) {
      setError("Enter a project name between 1 and 100 characters.");
      return;
    }
    const request = saved ?? {
      name: trimmed,
      key: crypto.randomUUID(),
      pending: false,
      uncertain: false,
    };
    requests.current.set(organizationId, request);
    request.pending = true;
    const isCurrent = () =>
      active.current &&
      currentOrganization.current === organizationId &&
      requests.current.get(organizationId) === request;
    setPending(true);
    setError(null);
    try {
      await onCreate(organizationId, request.name, request.key);
      if (isCurrent()) {
        setOpen(false);
        setUncertain(false);
        setPending(false);
      }
      requests.current.delete(organizationId);
    } catch (value) {
      const rejected =
        value instanceof ApiError &&
        value.status >= 400 &&
        value.status < 500 &&
        value.detail.code !== "IDEMPOTENCY_CONFLICT";
      // A rejection of a retry cannot disprove an earlier committed creation.
      request.uncertain ||= !rejected;
      if (isCurrent()) {
        setUncertain(request.uncertain);
        setError(
          request.uncertain
            ? null
            : "Project could not be created. Your name is preserved; try again.",
        );
      }
    } finally {
      request.pending = false;
      if (isCurrent()) setPending(false);
    }
  }
  return {
    open,
    name,
    pending,
    uncertain,
    error,
    start,
    close,
    submit,
    changeName(value: string) {
      const saved = organizationId
        ? requests.current.get(organizationId)
        : undefined;
      if (saved?.pending || saved?.uncertain) return;
      if (organizationId && saved && value.trim() !== saved.name)
        requests.current.delete(organizationId);
      setName(value);
      setError(null);
    },
  };
}
