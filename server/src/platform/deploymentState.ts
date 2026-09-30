let draining = false;

export const DEPLOYMENT_STOP_MESSAGE =
  "Извините, мы обновляем PartyPlay. Все текущие игры остановлены. После обновления можно будет создать новую комнату.";

export function isDeploymentDraining(): boolean {
  return draining;
}

export function setDeploymentDraining(nextDraining: boolean): void {
  draining = nextDraining;
}
