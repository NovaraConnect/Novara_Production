import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useState } from "react";

import { fetchSettings, saveSettings } from "@/lib/backendApi";
import { UserProfile } from "@/lib/storage";

/**
 * Profile (career statement + goal tags) backed by the authenticated backend's
 * /api/settings. Same public shape as before so the Settings screen is unchanged.
 */
export function useProfile() {
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile>({ careerStatement: "", goalTags: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchSettings(getToken)
      .then((s) => {
        if (active) {
          setProfile({ careerStatement: s.careerStatement ?? "", goalTags: s.goalTags ?? [] });
        }
      })
      .catch(() => {
        // leave defaults on failure
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getToken]);

  const update = useCallback(
    async (updates: Partial<UserProfile>) => {
      const updated = { ...profile, ...updates };
      setProfile(updated);
      await saveSettings(getToken, {
        careerStatement: updated.careerStatement,
        goalTags: updated.goalTags,
      });
    },
    [getToken, profile],
  );

  return { profile, loading, update };
}
