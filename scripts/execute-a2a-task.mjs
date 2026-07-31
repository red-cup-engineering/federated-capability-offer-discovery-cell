#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {executeRelationalOperationMessage} from "@red-cup-engineering/a2a-sovereign-operation-boundary-service";
import {discoverFederatedCapabilityOffers} from "../lib/discovery.mjs";
import {discoveryProtocol} from "../src/protocol.mjs";
import {loadDiscoveryRuntime} from "../src/runtime.mjs";

const operations = Object.freeze({
  "discover-federated-capability-offers": (input, runtime) =>
    discoverFederatedCapabilityOffers(input, runtime.providers),
});

export function executeA2aMessage(source, runtimeLoader = loadDiscoveryRuntime) {
  return executeRelationalOperationMessage(source, {
    protocol: discoveryProtocol,
    operations,
    runtimeLoader,
    responseFilename: "capability-offer-discovery-response.rmn.cbor",
    unknownOperationMessage: "unknown capability marketplace operation",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(await executeA2aMessage(JSON.parse(readFileSync(0, "utf8"))))}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

