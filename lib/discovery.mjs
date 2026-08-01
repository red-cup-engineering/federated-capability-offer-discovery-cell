import {
  checkTerm,
  decodeSemantic,
  semanticBytes,
  semanticId,
} from "@red-cup-engineering/rmn-semantic-conformance";
import {
  decodeRelationalValue,
  encodeRelationalValue,
  RELATIONAL_VALUE_TYPE,
} from "@red-cup-engineering/rmn-semantic-conformance/relational-value";

const ACTOR = "urn:ame:federated-capability-offer-discovery-cell";
const KIND = "org.emsenn.capability-offer.v3";
const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const COORDINATE_NAMES = Object.freeze(["signedAgentCard", "packageOperation", "deploymentHealth", "resourceMeter", "settlementReturn"]);

function fail(message) {
  throw new TypeError(message);
}

function exact(value, fields, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${label} must be a plain record`);
  }
  const keys = Object.keys(value);
  for (const field of fields) if (!Object.hasOwn(value, field)) fail(`${label} is missing ${field}`);
  for (const field of keys) if (!fields.includes(field)) fail(`${label} has unexpected ${field}`);
}

function text(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be nonempty text`);
  return value;
}

function absoluteUrl(value, label) {
  text(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    fail(`${label} must use HTTPS outside loopback development`);
  }
  return url.href;
}

function coordinateResidual(coordinate, state, reason) {
  return Object.freeze({
    kind: "org.emsenn.capability-offer.coordinate-residual.v1",
    coordinate,
    state,
    reason,
  });
}

function coordinateReference(value, coordinate, label) {
  const fields = ["kind", "href", ...(coordinate === "packageOperation" ? ["operation", "consumes", "emits", "invocation", "currentState"] : [])];
  exact(value, fields.filter((field) => Object.hasOwn(value, field) || field === "kind" || field === "href"), label);
  if (value.kind !== "reference") fail(`${label}.kind must be reference`);
  const reference = {kind: "reference", href: absoluteUrl(value.href, `${label}.href`)};
  if (coordinate === "packageOperation") {
    if (Object.hasOwn(value, "operation")) reference.operation = text(value.operation, `${label}.operation`);
    for (const field of ["consumes", "emits"]) {
      if (!Object.hasOwn(value, field)) continue;
      if (!Array.isArray(value[field]) || value[field].length === 0) fail(`${label}.${field} must name one or more declared media or semantic types`);
      reference[field] = Object.freeze(value[field].map((entry) => text(entry, `${label}.${field}[]`)));
    }
    for (const field of ["invocation", "currentState"]) {
      if (Object.hasOwn(value, field)) reference[field] = absoluteUrl(value[field], `${label}.${field}`);
    }
  }
  return Object.freeze(reference);
}

function coordinateValue(value, coordinate, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be a coordinate reference or residual`);
  if (value.kind === "reference") return coordinateReference(value, coordinate, label);
  exact(value, ["kind", "coordinate", "state", "reason"], label);
  if (value.kind !== "org.emsenn.capability-offer.coordinate-residual.v1" || value.coordinate !== coordinate
      || !["unknown", "missing", "unreachable"].includes(value.state)) {
    fail(`${label} is not a residual for ${coordinate}`);
  }
  text(value.reason, `${label}.reason`);
  return coordinateResidual(coordinate, value.state, value.reason);
}

function normalizeCoordinates(value) {
  if (value === undefined) {
    return Object.freeze(Object.fromEntries(COORDINATE_NAMES.map((coordinate) => [
      coordinate,
      coordinateResidual(coordinate, "missing", "the published v3 offer did not supply this coordinate"),
    ])));
  }
  exact(value, COORDINATE_NAMES, "offer.coordinates");
  return Object.freeze(Object.fromEntries(COORDINATE_NAMES.map((coordinate) => [
    coordinate,
    coordinateValue(value[coordinate], coordinate, `offer.coordinates.${coordinate}`),
  ])));
}

function decodeOffer(bytes) {
  const term = decodeSemantic(bytes);
  if (!semanticBytes(term).equals(Buffer.from(bytes))) fail("offer RMN is noncanonical");
  if (term?.[0] !== "ascribe" || JSON.stringify(term[1]) !== JSON.stringify(RELATIONAL_VALUE_TYPE)) {
    fail("offer requires a typed relational RMN ascription");
  }
  checkTerm(term[2], term[1]);
  const value = decodeRelationalValue(term[1], term[2]);
  exact(value, ["kind", "cell", "sku", "provider", "operation", "law", "agentCard", "authorization", "price", "expiresAt",
    ...(Object.hasOwn(value, "coordinates") ? ["coordinates"] : [])], "offer");
  if (value.kind !== KIND) fail("wrong capability offer kind");
  for (const field of ["provider", "operation", "agentCard", "expiresAt"]) text(value[field], `offer.${field}`);
  if (!NI.test(value.cell)) fail("offer.cell must be a stable canonical RMN cell identity");
  if (!NI.test(value.sku)) fail("offer.sku must be a canonical RMN product identity");
  if (!NI.test(value.law)) fail("offer.law must be a semantic identity");
  exact(value.authorization, ["profile", "grantRequired"], "offer.authorization");
  if (!["OCapN", "none"].includes(value.authorization.profile) || typeof value.authorization.grantRequired !== "boolean") {
    fail("offer authorization profile is unsupported");
  }
  exact(value.price, ["protocol", "asset", "amount", "network"], "offer.price");
  if (value.price.protocol !== "x402" || !/^[0-9]+$/u.test(value.price.amount)) fail("offer price must use x402 and an atomic amount");
  for (const field of ["asset", "network"]) text(value.price[field], `offer.price.${field}`);
  if (!Number.isFinite(Date.parse(value.expiresAt))) fail("offer expiry must be an instant");
  return { offer: Object.freeze({...value, coordinates: normalizeCoordinates(value.coordinates)}), offerNi: semanticId(term) };
}

export async function discoverFederatedCapabilityOffers(request, providers, options = {}) {
  // maximumCandidates is accepted only as a legacy hint.  It cannot truncate
  // the observed market; callers pay for the denominator they ask us to read.
  exact(request, ["kind", "requestId", "operation", "observer", "evaluatedAt",
    ...(Object.hasOwn(request ?? {}, "maximumCandidates") ? ["maximumCandidates"] : []), "endpoints"], "request");
  if (request.kind !== "org.emsenn.capability-offer-discovery.request.v1") fail("wrong discovery request kind");
  text(request.requestId, "requestId");
  text(request.operation, "operation");
  absoluteUrl(request.observer, "observer");
  const evaluatedAt = Date.parse(request.evaluatedAt);
  if (!Number.isFinite(evaluatedAt)) fail("evaluatedAt must be an exact instant");
  if (!Array.isArray(request.endpoints) || request.endpoints.length < 1) {
    fail("one explicit endpoint denominator is required");
  }
  if (!providers || typeof providers.observe !== "function" || typeof providers.record !== "function") {
    fail("contracted ActivityPub observation and WitnessJournal providers are required");
  }
  const endpoints = request.endpoints.map((endpoint) => {
    exact(endpoint, ["outbox", "actor", "agentCard"], "endpoint");
    return {
      outbox: absoluteUrl(endpoint.outbox, "endpoint.outbox"),
      actor: absoluteUrl(endpoint.actor, "endpoint.actor"),
      agentCard: absoluteUrl(endpoint.agentCard, "endpoint.agentCard"),
    };
  }).sort((left, right) => left.outbox.localeCompare(right.outbox));
  if (new Set(endpoints.map(({ outbox }) => outbox)).size !== endpoints.length) fail("endpoint denominator contains duplicate outboxes");
  const normalizedRequest = {...request, endpoints};
  const encodedRequest = encodeRelationalValue(normalizedRequest);
  const requestTerm = providers.identify
    ? await providers.identify(normalizedRequest)
    : {id: semanticId(["ascribe", encodedRequest.type, encodedRequest.term])};
  const candidates = [];
  const refusals = [];
  const residuals = [];
  for (const endpoint of endpoints) {
    try {
      const projections = await providers.observe({
        outboxUrl: endpoint.outbox,
        expectedActor: endpoint.actor,
        expectedAgentCard: endpoint.agentCard,
        recipient: request.observer,
      });
      for (const projection of projections) {
        const { offer, offerNi } = decodeOffer(projection.objectBytes);
        if (offer.operation !== request.operation) continue;
        if (offer.agentCard !== endpoint.agentCard) fail("offer Agent Card differs from the published ActivityPub projection");
        if (Date.parse(offer.expiresAt) <= evaluatedAt) continue;
        candidates.push(Object.freeze({
          offer: offerNi,
          cell: offer.cell,
          sku: offer.sku,
          activity: projection.activityId,
          publisher: endpoint.actor,
          provider: offer.provider,
          operation: offer.operation,
          law: offer.law,
          agentCard: offer.agentCard,
          authorization: offer.authorization,
          price: offer.price,
          expiresAt: offer.expiresAt,
          coordinates: offer.coordinates,
        }));
        for (const coordinate of COORDINATE_NAMES) {
          const observation = offer.coordinates[coordinate];
          if (observation.kind !== "reference") residuals.push(Object.freeze({
            ...observation,
            offer: offerNi,
            transition: "offer-coordinate-observation",
          }));
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      refusals.push({outbox: endpoint.outbox, reason});
      residuals.push(Object.freeze({
        ...coordinateResidual("deploymentHealth", "unreachable", reason),
        transition: "outbox-observation",
        outbox: endpoint.outbox,
      }));
    }
  }
  candidates.sort((left, right) => left.offer.localeCompare(right.offer));
  const record = Object.freeze({
    kind: "org.emsenn.capability-offer-discovery.result.v1",
    provider: ACTOR,
    request: requestTerm.id,
    operation: request.operation,
    denominator: endpoints.map(({outbox}) => outbox),
    completeness: "supplied-denominator-only",
    candidates,
    refusals,
    residuals,
  });
  const receipt = await providers.record({
    category: "federated-capability-offer-discovery",
    recordedAt: options.now ?? new Date().toISOString(),
    record,
  });
  return Object.freeze({...record, receipt: receipt ?? coordinateResidual("settlementReturn", "missing", "WitnessJournal provider returned no record receipt")});
}
