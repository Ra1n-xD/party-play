import { useEffect, useState } from "react";
import { nextMoscowMidnight } from "../../../shared/platform/dailyRewards";
import { petStatus } from "../../../shared/platform/pet";
import { useProfile } from "./context/ProfileContext";

export function usePetCareReminder() {
  const { profile } = useProfile();
  const pet = profile?.pet;
  const [needsCare, setNeedsCare] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      if (!pet) {
        setNeedsCare(false);
        return;
      }
      const now = Date.now();
      const status = petStatus(pet, now);
      setNeedsCare(status.canCare);
      if (status.alive) {
        timer = window.setTimeout(
          refresh,
          Math.max(50, Math.min(nextMoscowMidnight(now), status.expiresAt) - now + 25),
        );
      }
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pet]);

  return !!pet && needsCare;
}
