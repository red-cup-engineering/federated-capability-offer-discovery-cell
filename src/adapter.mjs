import {resolve} from "node:path";
import {listAddressedRmnOutbox} from "@emsenn/activitypub-services-section/rmn-outbox-client";
import {semanticId} from "@emsenn/rmn-semantic-conformance";
import {encodeRelationalValue} from "@emsenn/rmn-semantic-conformance/relational-value";
import {createSettlementStore} from "@emsenn/rwil-rdf-services/client";

function identifyRelationalValue(value) {
  const encoded = encodeRelationalValue(value);
  return {
    id: semanticId(["ascribe", encoded.type, encoded.term]),
  };
}

export function createCapabilityOfferDiscoveryRuntime({root}) {
  const store = createSettlementStore({
    settlementRoot: root,
    dataRoot: process.env.CAPABILITY_OFFER_DISCOVERY_DATA_ROOT ?? resolve(root, "data"),
    agentUrl: process.env.RWIL_RDF_AGENT ?? "http://127.0.0.1:19764/.well-known/agent-card.json",
    caip2: process.env.SETTLEMENT_CAIP2 ?? "eip155:5615610",
  });
  return Object.freeze({
    providers: Object.freeze({
      identify: async (value) => identifyRelationalValue(value),
      observe: (input) => listAddressedRmnOutbox(input),
      record: (input) => store.record(input),
    }),
  });
}
