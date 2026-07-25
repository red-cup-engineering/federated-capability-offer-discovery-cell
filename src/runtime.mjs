import {resolve} from "node:path";
import {loadBoundRuntime} from "@emsenn/a2a-sovereign-operation-boundary-service";

const ROOT = resolve(import.meta.dirname, "..");

export function loadDiscoveryRuntime(boundaryPath = process.env.CAPABILITY_OFFER_DISCOVERY_BOUNDARY ?? resolve(ROOT, "content/deployment/runtime-boundary.json")) {
  return loadBoundRuntime({
    boundaryPath,
    boundaryType: "DeploymentBoundary",
    factoryExport: "createCapabilityOfferDiscoveryRuntime",
    root: ROOT,
    inactiveMessage: "capability-offer discovery deployment is not activated",
  });
}

