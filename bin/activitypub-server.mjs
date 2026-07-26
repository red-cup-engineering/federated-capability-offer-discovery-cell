#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { serveActivityPubProvider } from "@emsenn/activitypub-services-section/server";
import { createDiscoveryOfferOutbox } from "../src/activitypub-offer.mjs";

const origin = process.env.ACTIVITYPUB_ORIGIN ?? "https://bare-cedar-fog.561.group";
const identifier = process.env.ACTIVITYPUB_IDENTIFIER ?? "capability-offer-discovery";

serveActivityPubProvider({
  origin,
  identifier,
  actorName: "Federated Capability Offer Discovery Cell",
  summary: "Publishes and executes bounded discovery of canonical RMN capability offers.",
  keyPath: process.env.ACTIVITYPUB_KEYS_PATH,
  statePath: process.env.ACTIVITYPUB_STATE_PATH,
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? "15614"),
  bearerToken: randomBytes(32).toString("base64url"),
  listOutbox: createDiscoveryOfferOutbox({ origin, identifier })
}).then(() => process.stdout.write(`${origin}/actors/${identifier}\n`)).catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
