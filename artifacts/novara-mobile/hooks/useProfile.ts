import { useState, useEffect, useCallback } from "react";
import { getProfile, saveProfile, UserProfile } from "@/lib/storage";

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>({ careerStatement: "", goalTags: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  const update = useCallback(
    async (updates: Partial<UserProfile>) => {
      const updated = { ...profile, ...updates };
      setProfile(updated);
      await saveProfile(updated);
    },
    [profile]
  );

  return { profile, loading, update };
}
