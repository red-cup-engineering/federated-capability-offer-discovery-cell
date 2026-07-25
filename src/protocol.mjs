import { createRelationalOperationProtocol } from "@emsenn/a2a-sovereign-operation-boundary-service";

export const discoveryProtocol = createRelationalOperationProtocol({
  requestKind: "org.emsenn.capability-offer-discovery.a2a-request.v1",
  responseKind: "org.emsenn.capability-offer-discovery.a2a-response.v1",
  label: "federated capability offer discovery",
});

