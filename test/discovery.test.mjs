import assert from "node:assert/strict";
import test from "node:test";
import {semanticBytes, semanticId} from "@red-cup-engineering/rmn-semantic-conformance";
import {encodeRelationalValue} from "@red-cup-engineering/rmn-semantic-conformance/relational-value";
import {discoverFederatedCapabilityOffers} from "../lib/discovery.mjs";

const ACTOR = "https://seller.example/actors/seller";
const OUTBOX = `${ACTOR}/outbox`;
const CARD = "https://seller.example/.well-known/agent-card.json";
const OBSERVER = "https://buyer.example/actors/buyer";
const LAW = semanticId(["mark", "test-law"]);

function canonical(value) {
  const encoded = encodeRelationalValue(value);
  const term = ["ascribe", encoded.type, encoded.term];
  return {term, bytes: semanticBytes(term), id: semanticId(term)};
}

function offer(overrides = {}) {
  return {
    kind: "org.emsenn.capability-offer.v3",
    cell: semanticId(["mark", "test-cell"]),
    sku: semanticId(["mark", "test-sku"]),
    provider: "urn:ame:test-provider-cell",
    operation: "test-operation",
    law: LAW,
    agentCard: CARD,
    authorization: {profile: "OCapN", grantRequired: true},
    price: {protocol: "x402", asset: "TEST", amount: "7", network: "eip155:5615610"},
    coordinates: {
      signedAgentCard: {kind: "reference", href: CARD},
      packageOperation: {kind: "reference", href: "https://seller.example/package#test-operation", operation: "test-operation", consumes: ["application/rmn+cbor"], emits: ["application/rmn+cbor"], invocation: CARD, currentState: "https://seller.example/status"},
      deploymentHealth: {kind: "reference", href: "https://seller.example/health"},
      resourceMeter: {kind: "reference", href: "https://seller.example/meter"},
      settlementReturn: {kind: "reference", href: "https://seller.example/settlement"},
    },
    expiresAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    kind: "org.emsenn.capability-offer-discovery.request.v1",
    requestId: "test-request",
    operation: "test-operation",
    observer: OBSERVER,
    evaluatedAt: "2026-07-24T00:00:00.000Z",
    maximumCandidates: 8,
    endpoints: [{outbox: OUTBOX, actor: ACTOR, agentCard: CARD}],
    ...overrides,
  };
}

test("discovers one unexpired canonical offer within the supplied denominator", async () => {
  const encodedOffer = canonical(offer());
  const records = [];
  const result = await discoverFederatedCapabilityOffers(request(), {
    observe: async (input) => {
      assert.deepEqual(input, {
        outboxUrl: OUTBOX,
        expectedActor: ACTOR,
        expectedAgentCard: CARD,
        recipient: OBSERVER,
      });
      return [{activityId: "https://seller.example/activities/offer-1", objectBytes: encodedOffer.bytes}];
    },
    record: async (record) => { records.push(record); return {settlement: "eip155:5615611:receipt"}; },
  }, {now: "2026-07-24T00:00:01.000Z"});

  assert.equal(result.completeness, "supplied-denominator-only");
  assert.deepEqual(result.denominator, [OUTBOX]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].offer, encodedOffer.id);
  assert.equal(result.candidates[0].cell, offer().cell);
  assert.equal(result.candidates[0].sku, offer().sku);
  assert.equal(result.candidates[0].authorization.profile, "OCapN");
  assert.equal(result.candidates[0].price.network, "eip155:5615610");
  assert.deepEqual(result.candidates[0].coordinates.packageOperation.consumes, ["application/rmn+cbor"]);
  assert.deepEqual(result.receipt, {settlement: "eip155:5615611:receipt"});
  assert.deepEqual(result.residuals, []);
  assert.equal(records.length, 1);
  assert.notEqual(records[0].record, result);
  assert.equal(records[0].record.receipt, undefined);
});

test("canonical request identity is independent of record insertion order", async () => {
  const ids = [];
  const providers = {
    observe: async () => [],
    record: async (record) => ids.push(record.record.request),
  };
  const original = request();
  const reordered = {
    endpoints: original.endpoints,
    maximumCandidates: original.maximumCandidates,
    evaluatedAt: original.evaluatedAt,
    observer: original.observer,
    operation: original.operation,
    requestId: original.requestId,
    kind: original.kind,
  };
  await discoverFederatedCapabilityOffers(original, providers);
  await discoverFederatedCapabilityOffers(reordered, providers);
  assert.equal(ids[0], ids[1]);
});

test("one endpoint failure is witnessed as a refusal without claiming ambient completeness", async () => {
  const result = await discoverFederatedCapabilityOffers(request(), {
    observe: async () => {
      throw new Error("signed ActivityPub observation unavailable");
    },
    record: async () => {},
  });
  assert.equal(result.candidates.length, 0);
  assert.deepEqual(result.refusals, [{
    outbox: OUTBOX,
    reason: "signed ActivityPub observation unavailable",
  }]);
  assert.equal(result.completeness, "supplied-denominator-only");
  assert.equal(result.residuals[0].state, "unreachable");
  assert.equal(result.residuals[0].transition, "outbox-observation");
});

test("retains a partial v3 offer as typed coordinate residuals", async () => {
  const incomplete = offer();
  delete incomplete.coordinates;
  const encodedOffer = canonical(incomplete);
  const result = await discoverFederatedCapabilityOffers(request(), {
    observe: async () => [{activityId: "https://seller.example/activities/offer-1", objectBytes: encodedOffer.bytes}],
    record: async () => ({id: "rwil-receipt"}),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].coordinates.resourceMeter.state, "missing");
  assert.equal(result.residuals.length, 5);
  assert.deepEqual(result.receipt, {id: "rwil-receipt"});
});

test("rejects duplicate outboxes before any observation", async () => {
  await assert.rejects(
    discoverFederatedCapabilityOffers(request({
      endpoints: [
        {outbox: OUTBOX, actor: ACTOR, agentCard: CARD},
        {outbox: OUTBOX, actor: ACTOR, agentCard: CARD},
      ],
    }), {observe: async () => [], record: async () => {}}),
    /duplicate outboxes/u,
  );
});
