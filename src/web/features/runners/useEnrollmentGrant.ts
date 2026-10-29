import { useEffect, useRef, useState } from "react";
import { ApiError, type EnrollmentGrant } from "@featherlane/contracts";

export function useEnrollmentGrant(
  onCreate: (name: string, key: string) => Promise<EnrollmentGrant>,
) {
  const [name, setName] = useState("Customer runner");
  const [grant, setGrant] = useState<EnrollmentGrant | null>(null);
  const [state, setState] = useState<
    "intro" | "pending" | "error" | "uncertain" | "created"
  >("intro");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const key = useRef(crypto.randomUUID());
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const expired = !!grant && Date.parse(grant.expiresAt) <= now;
  async function create() {
    if (pending.current) return;
    if (expired) {
      key.current = crypto.randomUUID();
      setGrant(null);
    }
    pending.current = true;
    setState("pending");
    setCopied(false);
    try {
      const response = await onCreate(name.trim(), key.current);
      if (alive.current) {
        setGrant(response);
        setState("created");
      }
    } catch (error) {
      if (alive.current)
        setState(
          error instanceof ApiError && error.status < 500
            ? "error"
            : "uncertain",
        );
    } finally {
      pending.current = false;
    }
  }
  function changeName(value: string) {
    if (pending.current || state === "uncertain") return;
    setName(value);
    if (state === "error") {
      key.current = crypto.randomUUID();
      setState("intro");
    }
  }
  async function copy() {
    if (!grant || expired) return;
    try {
      await navigator.clipboard.writeText(grant.token);
      if (alive.current) {
        setCopied(true);
        setCopyFailed(false);
      }
    } catch {
      if (alive.current) setCopyFailed(true);
    }
  }
  function close(onClose: () => void) {
    if (!pending.current) onClose();
  }
  return {
    name,
    changeName,
    grant,
    state,
    copied,
    copyFailed,
    expired,
    create,
    copy,
    close,
  };
}
