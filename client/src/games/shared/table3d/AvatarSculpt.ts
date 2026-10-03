import { MathUtils } from "three";
import type { AvatarId } from "../../../../../shared/platform/avatars";

export const facialGaussian = (value: number, width: number) =>
  Math.exp(-Math.pow(value / width, 2));

/** The shared front surface keeps eyelids and lips attached to the continuous sculpt. */
export function faceSurfaceDepth(id: AvatarId, x: number, y: number) {
  const human = id === "human" || id === "astronaut";
  const alien = id === "alien";
  const height = human ? 0.3 : alien ? 0.326 : 0.266;
  const lower = Math.max(0, -y / height);
  const width = (human ? 0.242 : 0.265) * (1 - lower * (human ? 0.2 : alien ? 0.36 : 0.06));
  const nz = Math.sqrt(Math.max(0, 1 - (x / width) ** 2 - (y / height) ** 2));
  const front = MathUtils.smoothstep(nz, 0, 0.55);
  const g = facialGaussian;
  const cheeks = g(Math.abs(x) - 0.11, 0.07) * g(y + 0.045, 0.07);
  if (human)
    return (
      nz * 0.225 +
      front *
        (0.06 * g(x, 0.033) * g(y + 0.02, 0.069) +
          0.029 * g(x, 0.085) * g(y + 0.13, 0.072) +
          cheeks * 0.016 +
          0.013 * g(Math.abs(x) - 0.094, 0.046) * g(y - 0.096, 0.04))
    );
  if (alien)
    return (
      nz * 0.234 + front * (0.013 * g(x, 0.031) * g(y + 0.047, 0.053) - 0.012 * g(y + 0.13, 0.062))
    );
  return (
    nz * 0.234 +
    front * (0.079 * g(x, id === "monkey" ? 0.145 : 0.127) * g(y + 0.095, 0.103) + cheeks * 0.009)
  );
}
