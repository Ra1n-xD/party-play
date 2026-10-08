import { randomInt, randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import type { ClientEvents, ServerEvents } from "../../../shared/types.js";
import {
  PET_BOOST_COST,
  PET_BOOST_GROWTH,
  PET_SPECIES,
  petStatus,
} from "../../../shared/platform/pet.js";
import { getMoscowDay } from "../../../shared/platform/dailyRewards.js";
import { profileStore, profileTransaction } from "./profileStorage.js";
import { assertProfileSession, profileRoom } from "./profileAuth.js";
import { guardProfileRequest } from "./profileRateLimit.js";
import type { IOServer } from "./gameModule.js";

export function registerPetHandlers(socket: Socket<ClientEvents, ServerEvents>, io: IOServer) {
  socket.on("pet:action", async (data, reply) => {
    if (typeof reply !== "function") return;
    try {
      guardProfileRequest(socket);
      const key = socket.data.profileKey as string;
      assertProfileSession(socket, key);
      await profileTransaction([key], (draft) => {
        assertProfileSession(socket, key);
        const now = Date.now();
        if (data?.day !== getMoscowDay(now))
          throw new Error("Начался новый день. Обновите страницу питомца");
        const profile = draft.profiles.get(key)!;
        const pet = profile.pet;
        if ((pet?.id ?? null) !== data.petId)
          throw new Error("Питомец уже изменился. Обновите страницу");
        if (data.action === "adopt") {
          if (pet && petStatus(pet, now).alive) throw new Error("У вас уже есть питомец");
          profile.pet = {
            id: randomUUID(),
            species: PET_SPECIES[randomInt(PET_SPECIES.length)],
            bornAt: now,
            lastCareAt: now,
            growth: 0,
            careDays: 0,
            lastBoostDay: null,
          };
          return;
        }
        if (!pet || !petStatus(pet, now).alive) throw new Error("Сначала возьмите новое яйцо");
        const status = petStatus(pet, now);
        if (data.action === "care") {
          if (!status.canCare) return false;
          // A legacy bonus claimed on the migration day must not pay twice.
          const reward = profile.dailyReward?.date === data.day ? 0 : status.reward;
          if (!Number.isSafeInteger(profile.coins + reward))
            throw new Error("Достигнут предел монет");
          profile.coins += reward;
          pet.growth = Math.min(30, pet.growth + 1);
          pet.careDays++;
          pet.lastCareAt = now;
        } else if (data.action === "boost") {
          if (!status.canBoost)
            throw new Error("Ускорение доступно раз в день, пока питомец растёт");
          if (profile.coins < PET_BOOST_COST) throw new Error("Не хватает монет");
          profile.coins -= PET_BOOST_COST;
          pet.growth = Math.min(30, pet.growth + PET_BOOST_GROWTH);
          pet.lastBoostDay = data.day;
        } else throw new Error("Неизвестное действие");
      });
      assertProfileSession(socket, key);
      const profile = profileStore.profiles.get(key)!;
      io.to(profileRoom(key)).emit("profile:snapshot", profile);
      reply({ ok: true, value: profile });
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  });
}
