let draining = false;

export function isDeploymentDraining(): boolean {
  return draining;
}

export function setDeploymentDraining(nextDraining: boolean): void {
  draining = nextDraining;
}
