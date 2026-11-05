import assert from "node:assert/strict";
import { test, mock, afterEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../src/models/User.js";
import { env } from "../src/config/env.js";
import { googleAuth, googleClient } from "../src/controllers/googleAuthController.js";

const originalClientId = env.GOOGLE_CLIENT_ID;
afterEach(() => { mock.restoreAll(); env.GOOGLE_CLIENT_ID = originalClientId; });
const profile = { sub: "google-123", email: "person@example.com", email_verified: true, name: "Person", picture: "https://example.com/avatar.png" };
function setup(payload = profile) {
    env.GOOGLE_CLIENT_ID = "test-client";
    mock.method(googleClient, "verifyIdToken", async (options) => {
        assert.equal(options.audience, "test-client");
        assert.equal(options.idToken, "signed-token");
        return { getPayload: () => payload };
    });
}
async function request(body = { credential: "signed-token" }) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
    await googleAuth({ body }, res, (err) => { throw err; });
    return res;
}
function queries(results) {
    mock.method(User, "findOne", () => ({ select: async () => results.shift() }));
}
test("missing configuration and malformed credentials fail before verification", async () => {
    env.GOOGLE_CLIENT_ID = "";
    assert.equal((await request()).statusCode, 503);
    setup();
    for (const credential of [null, {}, "", "x".repeat(16385)]) {
        assert.equal((await request({ credential })).statusCode, 400);
    }
    assert.equal(googleClient.verifyIdToken.mock.callCount(), 0);
});
test("invalid signature, expiry or audience from Google verifier is rejected", async () => {
    env.GOOGLE_CLIENT_ID = "test-client";
    mock.method(googleClient, "verifyIdToken", async () => { throw new Error("invalid token"); });
    assert.equal((await request()).statusCode, 401);
});
test("unverified email and missing subject are rejected", async () => {
    for (const payload of [{ ...profile, email_verified: false }, { ...profile, sub: null }, null]) {
        mock.restoreAll(); setup(payload);
        assert.equal((await request()).statusCode, 401);
    }
});
test("new Google user gets profile and a Fern JWT without password or Google ID disclosure", async () => {
    setup(); queries([null, null]);
    mock.method(User, "create", async (data) => {
        assert.equal(data.googleId, profile.sub);
        assert.equal(data.email, profile.email);
        assert.equal(data.avatarUrl, profile.picture);
        assert.equal(data.passwordHash, undefined);
        return { ...data, _id: "user-1", statusMessage: "" };
    });
    const res = await request();
    assert.equal(res.statusCode, 201);
    assert.equal(jwt.verify(res.data.token, env.JWT_SECRET).id, "user-1");
    assert.equal(res.data.user.googleId, undefined);
    assert.equal(res.data.user.passwordHash, undefined);
});
test("returning user is identified by Google subject even when email changes", async () => {
    setup(); queries([{ _id: "existing", name: "Original", email: "old@example.com" }]);
    const res = await request();
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.user.name, "Original");
    assert.equal(User.findOne.mock.callCount(), 1);
    assert.deepEqual(User.findOne.mock.calls[0].arguments[0], { googleId: profile.sub });
});
test("existing password account requires password before linking", async () => {
    setup();
    const account = { _id: "existing", passwordHash: "hash", save: mock.fn() };
    queries([null, account]);
    const res = await request();
    assert.equal(res.statusCode, 409);
    assert.equal(res.data.code, "PASSWORD_REQUIRED");
    assert.equal(account.save.mock.callCount(), 0);
});
test("wrong password cannot link an account", async () => {
    setup();
    const account = { _id: "existing", passwordHash: "hash", save: mock.fn() };
    queries([null, account]);
    mock.method(bcrypt, "compare", async () => false);
    assert.equal((await request({ credential: "signed-token", password: "wrong" })).statusCode, 401);
    assert.equal(account.save.mock.callCount(), 0);
});
test("correct password links account while preserving existing profile", async () => {
    setup();
    const account = { _id: "existing", name: "Original", email: profile.email, passwordHash: "hash", save: mock.fn(async () => {}) };
    queries([null, account]);
    mock.method(bcrypt, "compare", async (password, hash) => password === "correct" && hash === "hash");
    const res = await request({ credential: "signed-token", password: "correct" });
    assert.equal(res.statusCode, 200);
    assert.equal(account.googleId, profile.sub);
    assert.equal(account.save.mock.callCount(), 1);
    assert.equal(res.data.user.name, "Original");
    assert.equal(res.data.user.passwordHash, undefined);
});
test("a different linked identity cannot be replaced", async () => {
    setup(); queries([null, { googleId: "different-subject" }]);
    assert.equal((await request()).statusCode, 409);
});
test("concurrent duplicate account creation returns retryable conflict", async () => {
    setup(); queries([null, null]);
    mock.method(User, "create", async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });
    assert.equal((await request()).statusCode, 409);
});
