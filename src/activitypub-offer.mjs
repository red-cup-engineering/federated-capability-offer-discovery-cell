import { materializeRmnActivity, ACTIVITYSTREAMS_PUBLIC } from "@emsenn/activitypub-services-section/rmn-activity";
import { semanticBytes } from "@emsenn/rmn-semantic-conformance";
import { encodeRelationalValue } from "@emsenn/rmn-semantic-conformance/relational-value";

export const DISCOVERY_OFFER = Object.freeze({
  kind: "org.emsenn.capability-offer.v3",
  cell: "ni:///sha-256;N3uhukrVV1WpenGlzZTwH0N75wzafq2NHz4qAFDPD1U",
  sku: "ni:///sha-256;1tbycZv3ecewPXqUE0ksFEGHK9jmOIujeZz9IhO3hxI",
  provider: "urn:ame:federated-capability-offer-discovery-cell",
  operation: "discover-federated-capability-offers",
  law: "ni:///sha-256;uunL_W-1ylRh092ERDNXT378x_Hd5ndnHmPDY-skIjk",
  agentCard: "https://bare-cedar-fog.561.group/a2a/capability-offer-discovery/.well-known/agent-card.json",
  authorization: Object.freeze({ profile: "none", grantRequired: false }),
  price: Object.freeze({ protocol: "x402", asset: "USD", amount: "0", network: "eip155:5615610" }),
  expiresAt: "2027-07-25T00:00:00.000Z"
});

function offerBytes() {
  const encoded = encodeRelationalValue(DISCOVERY_OFFER);
  return semanticBytes(["ascribe", encoded.type, encoded.term]);
}

export function createDiscoveryOfferOutbox({ origin, identifier }) {
  const activity = materializeRmnActivity({
    type: "Offer",
    origin,
    identifier,
    recipient: ACTIVITYSTREAMS_PUBLIC,
    objectBytes: offerBytes(),
    agentCard: DISCOVERY_OFFER.agentCard
  });
  return async ({ cursor }) => {
    if (cursor !== undefined && cursor !== null) return { items: [] };
    return { items: [await activity] };
  };
}
