import { useEffect, useRef, useState } from "react";
import { zProjectView } from "@featherlane/contracts/validators";

export function useCreateProjectForm(
  organizationId: string | null,
  onCreate: (organizationId: string, name: string) => Promise<void>,
) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setOpen(false);
    setName("");
    setPending(false);
    setError(null);
    return () => {
      generation.current += 1;
    };
  }, [organizationId]);

  function start() {
    if (!organizationId || inFlight.current) return;
    setName("");
    setError(null);
    setOpen(true);
  }
  function close() {
    if (!inFlight.current) setOpen(false);
  }
  async function submit() {
    if (!organizationId || inFlight.current) return;
    const trimmed = name.trim();
    if (!zProjectView.shape.name.safeParse(trimmed).success) {
      setError("Enter a project name between 1 and 100 characters.");
      return;
    }
    const requestGeneration = generation.current;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await onCreate(organizationId, trimmed);
      if (generation.current === requestGeneration) setOpen(false);
    } catch {
      if (generation.current === requestGeneration) {
        setError(
          "Project could not be created. Your name is preserved; try again.",
        );
      }
    } finally {
      if (generation.current === requestGeneration) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }
  return {
    open,
    name,
    pending,
    error,
    start,
    close,
    submit,
    changeName(value: string) {
      setName(value);
      setError(null);
    },
  };
}
