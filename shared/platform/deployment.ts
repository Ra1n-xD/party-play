export interface DeploymentStatus {
  draining: boolean;
}

export const DEPLOYMENT_WAIT_MESSAGE =
  "Текущие игры можно доиграть. Создание комнат и запуск новых партий временно недоступны.";

export const DEPLOYMENT_ROOM_CLOSED_MESSAGE =
  "Комната закрыта перед обновлением PartySide. После обновления можно будет создать новую комнату.";
