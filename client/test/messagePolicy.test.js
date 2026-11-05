import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETE_WINDOW_MS, isWithinDeleteWindow } from "../../shared/messagePolicy.mjs";

const now = Date.parse("2026-11-05T10:00:00Z");
test("delete is available from sending until just before five minutes", () => {
    assert.equal(DELETE_WINDOW_MS, 300000);
    for (const age of [0, 1, DELETE_WINDOW_MS - 1]) {
        assert.equal(isWithinDeleteWindow(new Date(now - age).toISOString(), now), true);
    }
});
test("delete expires exactly at five minutes", () => {
    for (const age of [DELETE_WINDOW_MS, DELETE_WINDOW_MS + 1, 3600000]) {
        assert.equal(isWithinDeleteWindow(new Date(now - age).toISOString(), now), false);
    }
});
test("invalid and future creation dates are not deletable", () => {
    for (const createdAt of [undefined, null, "", "invalid", new Date(now + 1).toISOString()]) {
        assert.equal(isWithinDeleteWindow(createdAt, now), false);
    }
});
