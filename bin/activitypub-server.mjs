#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { serveActivityPubProvider } from "@red-cup-engineering/activitypub-services-section/server";
import { deliverActivity } from "@red-cup-engineering/activitypub-services-section/deliver";
import { extractRmnActivity, projectRmnActivity } from "@red-cup-engineering/activitypub-services-section/rmn-activity";
import { decodeSemantic, semanticBytes } from "@red-cup-engineering/rmn-semantic-conformance";
import { decodeRelationalValue, encodeRelationalValue, RELATIONAL_VALUE_TYPE } from "@red-cup-engineering/rmn-semantic-conformance/relational-value";
import { createDiscoveryOfferOutbox } from "../src/activitypub-offer.mjs";
import { createActivityPubR2Custody } from "../src/activitypub-r2-custody.mjs";
import { discoverFederatedCapabilityOffers } from "../lib/discovery.mjs";
import { loadDiscoveryRuntime } from "../src/runtime.mjs";

const origin = process.env.ACTIVITYPUB_ORIGIN ?? "https://bare-cedar-fog.561.group";
const identifier = process.env.ACTIVITYPUB_IDENTIFIER ?? "capability-offer-discovery";
const network = process.env.SETTLEMENT_CAIP2;
if (!network) throw new Error("SETTLEMENT_CAIP2 is required at the customer/deployment boundary");
const custody = createActivityPubR2Custody({ actor: identifier });
const actor = `${origin}/actors/${identifier}`;
const agentCard = process.env.A2A_AGENT_CARD_URL ?? `${origin}/actors/${identifier}`;
let provider;

async function receiveAgenticActivity(arrival) {
  const activity = arrival?.jsonLd;
  const sender = typeof activity?.actor === "string" ? activity.actor : null;
  if (!sender || sender === actor) return;
  const projection = extractRmnActivity(activity, { expectedActor: sender, expectedRecipient: actor });
  const term = decodeSemantic(projection.objectBytes);
  if (!Array.isArray(term) || term[0] !== "ascribe" || JSON.stringify(term[1]) !== JSON.stringify(RELATIONAL_VALUE_TYPE)) throw new TypeError("ActivityPub-carried A2A request is not a typed RMN operation");
  const request = decodeRelationalValue(term[1], term[2]);
  const runtime = await loadDiscoveryRuntime();
  const result = await discoverFederatedCapabilityOffers(request, runtime.providers);
  const encoded = encodeRelationalValue(result);
  const response = projectRmnActivity({
    type: "Accept", origin, identifier, recipient: sender,
    objectBytes: semanticBytes(["ascribe", encoded.type, encoded.term]), agentCard,
  });
  const senderDocument = await (await fetch(sender, { headers: { accept: "application/activity+json" } })).json();
  const inbox = typeof senderDocument?.inbox === "string" ? senderDocument.inbox : senderDocument?.inbox?.id;
  if (typeof inbox !== "string" || inbox === "") throw new Error("ActivityPub A2A sender actor exposes no inbox");
  await deliverActivity(provider, { activity: response, recipient: sender, inbox });
}

provider = await serveActivityPubProvider({
  origin,
  identifier,
  actorName: "Federated Capability Offer Discovery Cell",
  summary: "Publishes and executes bounded discovery of canonical RMN capability offers.",
  keyPath: process.env.ACTIVITYPUB_KEYS_PATH,
  kv: custody.kv,
  inbox: custody.inbox,
  queue: custody.queue,
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? "15614"),
  bearerToken: randomBytes(32).toString("base64url"),
  onActivity: receiveAgenticActivity,
  listOutbox: createDiscoveryOfferOutbox({ origin, identifier, network })
});
process.stdout.write(`${origin}/actors/${identifier}\n`);
process.on("uncaughtException", (error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
