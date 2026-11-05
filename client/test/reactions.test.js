import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";
import { groupReactions, isReactionEmoji, REACTION_EMOJIS } from "../../shared/reactions.mjs";
import { mergeReactionUpdate, mergeSavedMessage } from "../src/utils/messages.js";

const api = {};
globalThis.__fernReactionApi = api;
globalThis.__fernReactionSocket = null;
const storeUrl = new URL("../src/store/messageStore.js", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === storeUrl && ["../api/client", "../socket/socket"].includes(specifier)) {
      const source = specifier === "../api/client"
        ? "export const api = globalThis.__fernReactionApi;"
        : "export const getSocket = () => globalThis.__fernReactionSocket;";
      return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { useMessageStore: store } = await import(storeUrl);
const id = "507f1f77bcf86cd799439013";
const messageId = "507f1f77bcf86cd799439014";
const emoji = "\u{1F44D}";
const reactions = [{ emoji, userId: { _id: "me", name: "Maya" } }];
const message = { _id: messageId, conversationId: id, body: "hello", status: "sent", reactions: [],
  reactionVersion: 0, senderId: { _id: "other" }, createdAt: "2026-11-05T10:00:00Z" };
const update = { conversationId: id, messageId, reactions, reactionVersion: 2 };
const cached = () => store.getState().byConversation[id].messages[0];
function seed(messages = [message]) {
  store.setState({ byConversation: { [id]: { loaded: true, messages } } });
}
beforeEach(() => {
  store.getState().forgetConversation(id);
  store.setState({ byConversation: {} });
  globalThis.__fernReactionSocket = null;
  api.get = async () => ({ data: { messages: [], reactions: [], nextCursor: null } });
});

test("catalog contains unique searchable emoji choices", () => {
  assert.ok(REACTION_EMOJIS.length > 30);
  assert.equal(new Set(REACTION_EMOJIS.map((e) => e.emoji)).size, REACTION_EMOJIS.length);
  assert.ok(REACTION_EMOJIS.every((e) => e.label && e.category && isReactionEmoji(e.emoji)));
  assert.equal(isReactionEmoji("arbitrary"), false);
});

test("grouping counts unique reactors and identifies my reactions with names", () => {
  const groups = groupReactions([...reactions, ...reactions,
    { emoji, userId: { _id: "other", name: "Arun" } },
    { emoji: "\u{2764}\u{FE0F}", userId: "other" }], "me");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].users.length, 2);
  assert.equal(groups[0].mine, true);
  assert.equal(groups[0].users[1].name, "Arun");
  assert.equal(groups[1].mine, false);
});

test("stale reaction acknowledgements cannot overwrite a newer live event", () => {
  const latest = mergeReactionUpdate(message, update);
  assert.equal(mergeReactionUpdate(latest, { ...update, reactions: [], reactionVersion: 1 }), latest);
  assert.deepEqual(latest.reactions, reactions);
});

test("text edits and reactions merge independently despite newer reaction timestamps", () => {
  const current = { ...message, reactions, reactionVersion: 2, updatedAt: "2026-11-05T12:00:00Z" };
  const edited = { ...message, body: "edited", editedAt: "2026-11-05T11:00:00Z" };
  const result = mergeSavedMessage(current, edited);
  assert.equal(result.body, "edited");
  assert.deepEqual(result.reactions, reactions);
  assert.equal(result.reactionVersion, 2);
  assert.equal(mergeSavedMessage(result, current).body, "edited");
});

test("deleted messages cannot regain content or reactions from late responses", () => {
  const tombstone = mergeReactionUpdate({ ...message, reactions }, { ...update, deletedAt: "2026-11-05T12:00:00Z",
    reactionVersion: 3, reactions: [] });
  assert.equal(tombstone.body, "");
  assert.deepEqual(tombstone.reactions, []);
  const merged = mergeSavedMessage(tombstone, { ...message, reactions, reactionVersion: 1 });
  assert.ok(merged.deletedAt);
  assert.equal(merged.body, "");
  assert.deepEqual(merged.reactions, []);
  assert.equal(mergeReactionUpdate(tombstone, update), tombstone);
});

test("saved message and REST snapshots keep the freshest reaction version", () => {
  const current = { ...message, reactions, reactionVersion: 3 };
  assert.deepEqual(mergeSavedMessage(current, message).reactions, reactions);
  assert.deepEqual(mergeSavedMessage(message, current).reactions, reactions);
});

test("reaction sends explicit add/remove state and applies the saved ACK", async () => {
  seed();
  const calls = [];
  globalThis.__fernReactionSocket = { connected: true, timeout: () => ({
    emit: (event, payload, ack) => { calls.push({ event, payload }); ack(null, { ok: true, reaction: update }); },
  }) };
  assert.equal((await store.getState().setReaction(id, messageId, emoji, true)).ok, true);
  assert.deepEqual(calls, [{ event: "message:react", payload: { conversationId: id, messageId, emoji, active: true } }]);
  assert.deepEqual(cached().reactions, reactions);
});

test("offline and denied requests leave stored reactions unchanged", async () => {
  seed();
  assert.equal((await store.getState().setReaction(id, messageId, emoji, true)).ok, false);
  globalThis.__fernReactionSocket = { connected: true, timeout: () => ({
    emit: (_event, _payload, ack) => ack(null, { ok: false, status: 404, error: "No access" }),
  }) };
  assert.equal((await store.getState().setReaction(id, messageId, emoji, true)).ok, false);
  assert.deepEqual(cached().reactions, []);
});

test("late reaction ACK after removal cannot restore the cache", async () => {
  seed();
  let acknowledge;
  globalThis.__fernReactionSocket = { connected: true, timeout: () => ({
    emit: (_event, _payload, ack) => { acknowledge = ack; },
  }) };
  const pending = store.getState().setReaction(id, messageId, emoji, true);
  store.getState().forgetConversation(id);
  acknowledge(null, { ok: true, reaction: update });
  assert.equal((await pending).ok, false);
  assert.equal(store.getState().byConversation[id], undefined);
});

test("initial history preserves live reactions and messages received during the request", async () => {
  let resolve;
  api.get = (route) => route.endsWith("/reactions")
    ? Promise.resolve({ data: { reactions: [] } })
    : new Promise((done) => { resolve = done; });
  const fetching = store.getState().fetchMessages(id);
  store.getState().receiveMessage(message);
  store.getState().updateReactions(update);
  const extra = { ...message, _id: "507f1f77bcf86cd799439015", body: "new",
    createdAt: "2026-11-05T10:01:00Z" };
  store.getState().receiveMessage(extra);
  resolve({ data: { messages: [message] } });
  await fetching;
  assert.deepEqual(cached().reactions, reactions);
  assert.equal(store.getState().byConversation[id].messages.length, 2);
});

test("page refresh restores saved reactions from history", async () => {
  api.get = async () => ({ data: { messages: [{ ...message, reactions, reactionVersion: 2 }] } });
  await store.getState().fetchMessages(id);
  assert.deepEqual(cached().reactions, reactions);
  assert.equal(cached().status, "sent");
});

test("reconnect refreshes reactions on all loaded pages in batches of 100", async () => {
  const messages = Array.from({ length: 101 }, (_, index) =>
    ({ ...message, _id: (index + 1).toString(16).padStart(24, "0") }));
  seed(messages);
  const batches = [];
  api.get = async (route, { params }) => {
    if (!route.endsWith("/reactions")) return { data: { messages: [] } };
    const ids = params.ids.split(",");
    batches.push(ids);
    return { data: { reactions: ids.map((messageId) => ({ ...update, messageId })) } };
  };
  await store.getState().syncAfterReconnect();
  assert.deepEqual(batches.map((batch) => batch.length), [100, 1]);
  assert.ok(store.getState().byConversation[id].messages.every((m) => m.reactionVersion === 2));
});

test("live reaction arriving during reconnect wins over the older snapshot", async () => {
  seed();
  api.get = async (route) => {
    if (!route.endsWith("/reactions")) return { data: { messages: [] } };
    store.getState().updateReactions({ ...update, reactionVersion: 3 });
    return { data: { reactions: [{ ...update, reactions: [], reactionVersion: 2 }] } };
  };
  await store.getState().syncAfterReconnect();
  assert.equal(cached().reactionVersion, 3);
  assert.deepEqual(cached().reactions, reactions);
});

test("removed cache ignores live pushes and in-flight reconnect snapshots", async () => {
  seed();
  api.get = async (route) => {
    if (!route.endsWith("/reactions")) return { data: { messages: [] } };
    store.getState().forgetConversation(id);
    return { data: { reactions: [update] } };
  };
  await store.getState().syncAfterReconnect();
  store.getState().updateReactions(update);
  assert.equal(store.getState().byConversation[id], undefined);
});

test("first-load snapshot recovers reactions that arrived before the history ID was cached", async () => {
  api.get = async (route) => {
    if (route.endsWith("/reactions")) return { data: { reactions: [update] } };
    store.getState().updateReactions(update);
    return { data: { messages: [message] } };
  };
  await store.getState().fetchMessages(id);
  assert.deepEqual(cached().reactions, reactions);
});

test("older-page snapshot recovers missed reactions for newly loaded history IDs", async () => {
  const newest = { ...message, _id: "507f1f77bcf86cd799439015" };
  store.setState({ byConversation: { [id]: { loaded: true, messages: [newest], nextCursor: newest._id } } });
  api.get = async (route) => {
    if (route.endsWith("/reactions")) return { data: { reactions: [update] } };
    store.getState().updateReactions(update);
    return { data: { messages: [message] } };
  };
  await store.getState().loadOlder(id);
  assert.deepEqual(cached().reactions, reactions);
});
