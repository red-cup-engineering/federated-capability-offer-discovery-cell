import { createHash, randomUUID } from "node:crypto";
import { createR2RestClient, r2RestConfiguration } from "@red-cup-engineering/resource-brokerage-service-section/r2-rest";

const encoder = new TextEncoder();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonicalKey = (key) => digest(JSON.stringify(key));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function encode(value) { return encoder.encode(JSON.stringify(value)); }
function decode(remote, label) {
  try { return JSON.parse(Buffer.from(remote.body).toString("utf8")); }
  catch (error) { throw new Error(`${label} custody record is not JSON: ${error.message}`); }
}

function paginate(items, cursor, limit) {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError("ActivityPub custody cursor is invalid");
  const selected = items.slice(offset, offset + limit);
  return { items: selected, totalItems: items.length, ...(offset + selected.length < items.length ? { nextCursor: String(offset + selected.length) } : {}) };
}

async function listRecords(client, prefix, label) {
  const keys = [];
  let cursor;
  do {
    const page = await client.list(prefix, cursor);
    keys.push(...page.keys);
    cursor = page.continuationToken;
  } while (cursor !== undefined);
  const records = await Promise.all(keys.map(async (key) => {
    const remote = await client.get(key);
    return remote === null ? null : { key, value: decode(remote, label) };
  }));
  return records.filter(Boolean);
}

function createR2Kv(client, prefix) {
  let writes = Promise.resolve();
  const keyFor = (key) => `${prefix}/kv/${canonicalKey(key)}.json`;
  const write = (operation) => {
    const next = writes.then(operation, operation);
    writes = next.then(() => undefined, () => undefined);
    return next;
  };
  async function recordFor(key) {
    const remote = await client.get(keyFor(key));
    return remote === null ? null : decode(remote, "ActivityPub KV");
  }
  return Object.freeze({
    async get(key) {
      const record = await recordFor(key);
      return record === null || record.deleted === true || (record.expiresAt !== null && Date.now() >= record.expiresAt) ? undefined : record.value;
    },
    async set(key, value, options = {}) {
      const milliseconds = options.ttl === undefined ? null : Number(options.ttl.total({ unit: "milliseconds" }));
      if (milliseconds !== null && (!Number.isFinite(milliseconds) || milliseconds < 0)) throw new TypeError("ActivityPub KV TTL is invalid");
      await write(() => client.putCurrent(keyFor(key), { body: encode({ key, value, deleted: false, expiresAt: milliseconds === null ? null : Date.now() + milliseconds }), mediaType: "application/json" }));
    },
    async delete(key) {
      await write(() => client.putCurrent(keyFor(key), { body: encode({ key, value: null, deleted: true, expiresAt: null }), mediaType: "application/json" }));
    },
    async cas(key, expectedValue, newValue, options = {}) {
      return write(async () => {
        const record = await recordFor(key);
        const current = record === null || record.deleted === true || (record.expiresAt !== null && Date.now() >= record.expiresAt) ? undefined : record.value;
        if (JSON.stringify(current) !== JSON.stringify(expectedValue)) return false;
        const milliseconds = options.ttl === undefined ? null : Number(options.ttl.total({ unit: "milliseconds" }));
        await client.putCurrent(keyFor(key), { body: encode({ key, value: newValue, deleted: false, expiresAt: milliseconds === null ? null : Date.now() + milliseconds }), mediaType: "application/json" });
        return true;
      });
    },
    async *list(requestedPrefix = undefined) {
      for (const { value } of await listRecords(client, `${prefix}/kv/`, "ActivityPub KV")) {
        if (value.deleted === true || (value.expiresAt !== null && Date.now() >= value.expiresAt)) continue;
        if (requestedPrefix !== undefined && !requestedPrefix.every((part, index) => value.key[index] === part)) continue;
        yield { key: value.key, value: value.value };
      }
    },
  });
}

function createR2Inbox(client, prefix) {
  const root = `${prefix}/inbox/`;
  return Object.freeze({
    async retain(arrival) {
      const activity = arrival?.jsonLd;
      if (activity === null || typeof activity !== "object") throw new TypeError("verified ActivityPub arrival is required");
      const identity = typeof activity.id === "string" && activity.id !== "" ? activity.id : JSON.stringify(activity);
      await client.putCurrent(`${root}${digest(identity)}.json`, { body: encode({ receivedAt: new Date().toISOString(), activity }), mediaType: "application/json" });
    },
    async list({ cursor, limit }) {
      const records = await listRecords(client, root, "ActivityPub inbox");
      const activities = records.map(({ value }) => value).sort((left, right) => String(right.receivedAt).localeCompare(String(left.receivedAt))).map(({ activity }) => activity);
      return paginate(activities, cursor, limit);
    },
  });
}

function createR2Queue(client, prefix) {
  const root = `${prefix}/queue/`;
  let listener;
  const records = () => listRecords(client, root, "ActivityPub queue");
  return Object.freeze({
    nativeRetrial: true,
    async enqueue(message, options = {}) {
      const milliseconds = options.delay === undefined ? 0 : Number(options.delay.total({ unit: "milliseconds" }));
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new TypeError("ActivityPub queue delay is invalid");
      const id = randomUUID();
      await client.putCurrent(`${root}${id}.json`, { body: encode({ id, message, status: "pending", attempts: 0, availableAt: Date.now() + milliseconds }), mediaType: "application/json" });
    },
    async listen(handler, options = {}) {
      if (listener !== undefined) throw new Error("ActivityPub queue already has a listener");
      listener = (async () => {
        while (!options.signal?.aborted) {
          for (const { key, value } of await records()) {
            if (value.status !== "pending" || value.availableAt > Date.now()) continue;
            try {
              await client.putCurrent(key, { body: encode({ ...value, status: "processing" }), mediaType: "application/json" });
              await handler(value.message);
              await client.putCurrent(key, { body: encode({ ...value, status: "done", completedAt: new Date().toISOString() }), mediaType: "application/json" });
            } catch {
              await client.putCurrent(key, { body: encode({ ...value, status: "pending", attempts: value.attempts + 1, availableAt: Date.now() + Math.min(60_000, 1_000 * 2 ** value.attempts) }), mediaType: "application/json" });
            }
          }
          await delay(1_000);
        }
      })();
      return listener;
    },
    async getDepth() {
      const pending = (await records()).map(({ value }) => value).filter((value) => value.status === "pending");
      return { queued: pending.length, ready: pending.filter((value) => value.availableAt <= Date.now()).length, delayed: pending.filter((value) => value.availableAt > Date.now()).length };
    },
  });
}

export function createActivityPubR2Custody({ actor, client = createR2RestClient(r2RestConfiguration()) }) {
  if (typeof actor !== "string" || actor === "") throw new TypeError("ActivityPub R2 custody actor is required");
  const prefix = `activitypub/v1/${digest(actor)}`;
  return Object.freeze({ kv: createR2Kv(client, prefix), inbox: createR2Inbox(client, prefix), queue: createR2Queue(client, prefix) });
}
