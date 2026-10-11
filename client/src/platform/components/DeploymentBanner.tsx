import { useEffect, useState } from "react";
import { DEPLOYMENT_WAIT_MESSAGE } from "../../../../shared/platform/deployment";
import { usePlatform } from "../context/PlatformContext";
import { NotificationDialog } from "./NotificationDialog";

export function DeploymentBanner() {
  const { deploymentDraining } = usePlatform();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!deploymentDraining) setDismissed(false);
  }, [deploymentDraining]);
  if (!deploymentDraining || dismissed) return null;

  return (
    <NotificationDialog
      title="Скоро обновление"
      kind="info"
      message={DEPLOYMENT_WAIT_MESSAGE}
      onClose={() => setDismissed(true)}
    />
  );
}
