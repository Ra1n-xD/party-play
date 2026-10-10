import { DEPLOYMENT_WAIT_MESSAGE } from "../../../../shared/platform/deployment";
import { usePlatform } from "../context/PlatformContext";

export function DeploymentBanner() {
  const { deploymentDraining } = usePlatform();
  if (!deploymentDraining) return null;

  return (
    <aside className="deployment-banner" role="status">
      <span className="deployment-banner-icon" aria-hidden="true">
        ↻
      </span>
      <div>
        <strong>Скоро обновление</strong>
        <p>{DEPLOYMENT_WAIT_MESSAGE}</p>
      </div>
    </aside>
  );
}
