import { useEffect, useState } from "react";
import { petStatus, type PetSpecies } from "../../../shared/platform/pet";
import { useProfile } from "./context/ProfileContext";
export function useTablePet(): { stage: number | null; species: PetSpecies } {
  const { profile } = useProfile();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const status = profile?.pet && now ? petStatus(profile.pet, now) : null;
  return {
    stage: status?.alive ? status.stage : null,
    species: profile?.pet?.species ?? "dragon",
  };
}
