import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";
import { changePassword } from "../src/controllers/authController.js";
import { createRateLimiter } from "../src/middleware/rateLimit.js";

const userId = "507f1f77bcf86cd799439011";
afterEach(() => mock.restoreAll());

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

test("changePassword validates newPassword length and type before querying MongoDB", async () => {
  mock.method(User, "findById", () => { throw new Error("Unexpected query"); });
  for (const body of [{}, { newPassword: "short" }, { newPassword: 12345678 }, { newPassword: "x".repeat(129) }]) {
    const res = makeRes();
    await changePassword({ user: { _id: userId }, body }, res, (err) => { throw err; });
    assert.equal(res.statusCode, 400);
  }
});

test("changePassword verifies current password and rejects reuse", async () => {
  const account = { _id: userId, passwordHash: "stored-hash", save: mock.fn() };
  mock.method(User, "findById", () => ({ select: async () => account }));

  const missingCurrent = makeRes();
  await changePassword({ user: { _id: userId }, body: { newPassword: "new-password-1" } }, missingCurrent, (e) => { throw e; });
  assert.equal(missingCurrent.statusCode, 400);

  mock.method(bcrypt, "compare", async () => false);
  const wrongCurrent = makeRes();
  await changePassword(
    { user: { _id: userId }, body: { currentPassword: "wrong", newPassword: "new-password-1" } },
    wrongCurrent,
    (e) => { throw e; }
  );
  assert.equal(wrongCurrent.statusCode, 401);

  mock.method(bcrypt, "compare", async () => true);
  const samePassword = makeRes();
  await changePassword(
    { user: { _id: userId }, body: { currentPassword: "same-password", newPassword: "same-password" } },
    samePassword,
    (e) => { throw e; }
  );
  assert.equal(samePassword.statusCode, 400);
  assert.equal(account.save.mock.callCount(), 0);
});

test("changePassword hashes and saves updated password, and allows Google-only users to set one", async () => {
  const account = { _id: userId, passwordHash: "old-hash", save: mock.fn(async () => {}) };
  mock.method(User, "findById", () => ({ select: async () => account }));
  mock.method(bcrypt, "compare", async (pw, hash) => pw === "old-secret" && hash === "old-hash");
  mock.method(bcrypt, "hash", async (pw) => `hashed:${pw}`);

  const res = makeRes();
  await changePassword(
    { user: { _id: userId }, body: { currentPassword: "old-secret", newPassword: "new-secret-99" } },
    res,
    (e) => { throw e; }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(account.passwordHash, "hashed:new-secret-99");
  assert.equal(account.save.mock.callCount(), 1);

  const googleOnly = { _id: userId, passwordHash: undefined, save: mock.fn(async () => {}) };
  mock.method(User, "findById", () => ({ select: async () => googleOnly }));
  const res2 = makeRes();
  await changePassword(
    { user: { _id: userId }, body: { newPassword: "first-password" } },
    res2,
    (e) => { throw e; }
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(googleOnly.passwordHash, "hashed:first-password");
  assert.equal(googleOnly.save.mock.callCount(), 1);
});

test("rate limiter enforces limits, sets headers, isolates keys, and resets after window", () => {
  let now = 1000;
  mock.method(Date, "now", () => now);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: "Slow down" });

  let nextCalls = 0;
  const reqA = { ip: "10.0.0.1" };
  const reqB = { ip: "10.0.0.2" };

  const r1 = makeRes();
  limiter(reqA, r1, () => { nextCalls++; });
  assert.equal(nextCalls, 1);
  assert.equal(r1.headers["X-RateLimit-Remaining"], "1");

  const r2 = makeRes();
  limiter(reqA, r2, () => { nextCalls++; });
  assert.equal(nextCalls, 2);
  assert.equal(r2.headers["X-RateLimit-Remaining"], "0");

  const r3 = makeRes();
  limiter(reqA, r3, () => { nextCalls++; });
  assert.equal(nextCalls, 2);
  assert.equal(r3.statusCode, 429);
  assert.equal(r3.body.message, "Slow down");
  assert.equal(r3.headers["Retry-After"], "60");

  const rB = makeRes();
  limiter(reqB, rB, () => { nextCalls++; });
  assert.equal(nextCalls, 3);

  now += 60_001;
  const rReset = makeRes();
  limiter(reqA, rReset, () => { nextCalls++; });
  assert.equal(nextCalls, 4);
  assert.equal(rReset.headers["X-RateLimit-Remaining"], "1");
});
