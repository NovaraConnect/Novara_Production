import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useState } from "react";

import {
  getLocalContacts,
  hasMigratedLocalContacts,
  importLocalContactsToBackend,
} from "@/lib/localImport";

/**
 * Drives the one-time "import your on-device contacts" prompt.
 * - Shows only when there are local contacts AND the user hasn't imported yet.
 * - Import is non-destructive (local copy is retained) and idempotent.
 * - "Not now" hides the prompt for this session only (no data touched).
 */
export function useLocalImport(onImported?: () => void) {
  const { getToken } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [checked, setChecked] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const already = await hasMigratedLocalContacts();
      const local = already ? [] : await getLocalContacts();
      if (!active) return;
      setMigrated(already);
      setPendingCount(local.length);
      setChecked(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const runImport = useCallback(async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await importLocalContactsToBackend(getToken);
      setResult(res);
      setMigrated(true);
      onImported?.();
    } catch {
      setError("Import failed. Your on-device contacts are safe — you can try again.");
    } finally {
      setImporting(false);
    }
  }, [getToken, onImported]);

  const dismiss = useCallback(() => setDismissedThisSession(true), []);

  const visible = checked && !migrated && !dismissedThisSession && pendingCount > 0;

  return { visible, pendingCount, importing, error, result, runImport, dismiss };
}
