import { materializeRmnActivity, ACTIVITYSTREAMS_PUBLIC } from "@red-cup-engineering/activitypub-services-section/rmn-activity";
import { semanticBytes } from "@red-cup-engineering/rmn-semantic-conformance";
import { encodeRelationalValue } from "@red-cup-engineering/rmn-semantic-conformance/relational-value";

const CAIP2 = /^eip155:[1-9][0-9]*$/u;

export function createDiscoveryOffer({ network, agentCard = process.env.A2A_AGENT_CARD_URL ?? `${process.env.ACTIVITYPUB_ORIGIN ?? "https://bare-cedar-fog.561.group"}/actors/${process.env.ACTIVITYPUB_IDENTIFIER ?? "capability-offer-discovery"}` }) {
  if (typeof network !== "string" || !CAIP2.test(network)) throw new TypeError("network must be an EIP-155 CAIP-2 identifier supplied by the customer");
  return Object.freeze({
  kind: "org.emsenn.capability-offer.v3",
  cell: "ni:///sha-256;N3uhukrVV1WpenGlzZTwH0N75wzafq2NHz4qAFDPD1U",
  sku: "ni:///sha-256;1tbycZv3ecewPXqUE0ksFEGHK9jmOIujeZz9IhO3hxI",
  provider: "urn:ame:federated-capability-offer-discovery-cell",
  operation: "discover-federated-capability-offers",
  law: "ni:///sha-256;uunL_W-1ylRh092ERDNXT378x_Hd5ndnHmPDY-skIjk",
  agentCard,
  authorization: Object.freeze({ profile: "none", grantRequired: false }),
  price: Object.freeze({ protocol: "x402", asset: "USD", amount: "0", network }),
  expiresAt: "2027-07-25T00:00:00.000Z"
  });
}

function offerBytes(offer) {
  const encoded = encodeRelationalValue(offer);
  return semanticBytes(["ascribe", encoded.type, encoded.term]);
}

export function createDiscoveryOfferOutbox({ origin, identifier, network }) {
  const offer = createDiscoveryOffer({ network });
  const activity = materializeRmnActivity({
    type: "Offer",
    origin,
    identifier,
    recipient: ACTIVITYSTREAMS_PUBLIC,
    objectBytes: offerBytes(offer),
    agentCard: offer.agentCard
  });
  return async ({ cursor }) => {
    if (cursor !== undefined && cursor !== null) return { items: [] };
    return { items: [await activity] };
  };
}
