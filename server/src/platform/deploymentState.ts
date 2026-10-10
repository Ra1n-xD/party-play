import type { DeploymentStatus } from "../../../shared/platform/deployment.js";

export {
  DEPLOYMENT_ROOM_CLOSED_MESSAGE,
  DEPLOYMENT_WAIT_MESSAGE,
} from "../../../shared/platform/deployment.js";

let draining = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let publishStatus: (status: DeploymentStatus) => void = () => {};

export function setDeploymentStatusPublisher(publisher: typeof publishStatus): void {
  publishStatus = publisher;
}

export function isDeploymentDraining(): boolean {
  return draining;
}

export function setDeploymentDraining(nextDraining: boolean, timeoutMs = 1_020_000): void {
  clearTimeout(expiryTimer);
  expiryTimer = undefined;
  draining = nextDraining;
  publishStatus({ draining });
  if (draining) {
    // Recover even if SSH or the deployment process dies without running its exit trap.
    expiryTimer = setTimeout(() => setDeploymentDraining(false), timeoutMs);
    expiryTimer.unref();
  }
}
