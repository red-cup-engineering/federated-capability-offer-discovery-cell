import { materializeRmnActivity, ACTIVITYSTREAMS_PUBLIC } from "@red-cup-engineering/activitypub-services-section/rmn-activity";
import { semanticBytes } from "@red-cup-engineering/rmn-semantic-conformance";
import { encodeRelationalValue } from "@red-cup-engineering/rmn-semantic-conformance/relational-value";

const CAIP2 = /^eip155:[1-9][0-9]*$/u;
const RESIDUAL_KIND = "org.emsenn.capability-offer.coordinate-residual.v1";

function coordinate(coordinate, value, reason) {
  return value
    ? Object.freeze(typeof value === "string" ? {kind: "reference", href: value} : {kind: "reference", ...value})
    : Object.freeze({kind: RESIDUAL_KIND, coordinate, state: "missing", reason});
}

export function createDiscoveryOffer({ network, agentCard = process.env.A2A_AGENT_CARD_URL ?? `${process.env.ACTIVITYPUB_ORIGIN ?? "https://bare-cedar-fog.561.group"}/actors/${process.env.ACTIVITYPUB_IDENTIFIER ?? "capability-offer-discovery"}`, coordinates = {} }) {
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
  coordinates: Object.freeze({
    signedAgentCard: coordinate("signedAgentCard", coordinates.signedAgentCard ?? agentCard, "no signed Agent Card reference was supplied"),
    packageOperation: coordinate("packageOperation", coordinates.packageOperation ?? {
      href: "https://www.npmjs.com/package/@red-cup-engineering/federated-capability-offer-discovery-cell",
      operation: "discover-federated-capability-offers",
      consumes: ["application/rmn+cbor"],
      emits: ["application/rmn+cbor"],
      invocation: agentCard,
    }, "no owner-authored package operation reference was supplied"),
    deploymentHealth: coordinate("deploymentHealth", coordinates.deploymentHealth, "no live deployment or health reference was supplied"),
    resourceMeter: coordinate("resourceMeter", coordinates.resourceMeter, "no provider-native resource meter reference was supplied"),
    settlementReturn: coordinate("settlementReturn", coordinates.settlementReturn, "no settlement-return reference was supplied"),
  }),
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
