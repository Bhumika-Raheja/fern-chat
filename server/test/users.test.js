import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import User from "../src/models/User.js";
import { getUserProfile, updateProfile } from "../src/controllers/userController.js";

const userId = "507f1f77bcf86cd799439011";
afterEach(() => mock.restoreAll());

function harness({ params = {}, body = {} } = {}) {
  const req = { user: { _id: userId }, params, body };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = (err) => { throw err; };
  return { req, res, next };
}

test("getUserProfile rejects invalid user IDs without querying MongoDB", async () => {
  mock.method(User, "findById", () => { throw new Error("Unexpected query"); });
  const h = harness({ params: { id: "not-an-id" } });
  await getUserProfile(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 400);
});

test("getUserProfile returns 404 when the user does not exist", async () => {
  mock.method(User, "findById", () => ({
    select() { return this; },
    lean: async () => null,
  }));
  const h = harness({ params: { id: userId } });
  await getUserProfile(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 404);
});

test("getUserProfile returns only public profile fields", async () => {
  const publicUser = {
    _id: userId,
    name: "Anirudh",
    avatarUrl: "https://res.cloudinary.com/demo/image/upload/avatar.png",
    statusMessage: "Building backend APIs",
    lastSeenAt: new Date("2026-11-28T09:00:00Z"),
  };
  let selectedFields;
  mock.method(User, "findById", (id) => {
    assert.equal(id, userId);
    return {
      select(fields) { selectedFields = fields; return this; },
      lean: async () => publicUser,
    };
  });

  const h = harness({ params: { id: userId } });
  await getUserProfile(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(selectedFields, "_id name avatarUrl statusMessage lastSeenAt");
  assert.deepEqual(h.res.body.user, publicUser);
});

test("updateProfile rejects empty payloads and invalid field values", async () => {
  mock.method(User, "findByIdAndUpdate", () => { throw new Error("Unexpected update"); });
  for (const body of [
    {},
    { name: "   " },
    { name: 123 },
    { name: "x".repeat(61) },
    { statusMessage: 42 },
    { statusMessage: "x".repeat(101) },
    { avatarUrl: 99 },
    { avatarUrl: "javascript:alert(1)" },
    { avatarUrl: "http://insecure.example.com/pic.png" },
    { avatarUrl: "https://example.com/" + "a".repeat(500) },
  ]) {
    const h = harness({ body });
    await updateProfile(h.req, h.res, h.next);
    assert.equal(h.res.statusCode, 400);
  }
});

test("updateProfile trims valid fields, allows clearing avatarUrl/statusMessage, and persists updates", async () => {
  mock.method(User, "findByIdAndUpdate", async (id, update, options) => {
    assert.equal(id, userId);
    assert.deepEqual(update, {
      $set: {
        name: "Anirudh Sharma",
        statusMessage: "Online",
        avatarUrl: "",
      },
    });
    assert.equal(options.returnDocument, "after");
    assert.equal(options.runValidators, true);
    return {
      _id: userId,
      name: "Anirudh Sharma",
      email: "anirudh@example.com",
      statusMessage: "Online",
      avatarUrl: "",
      lastSeenAt: null,
    };
  });

  const h = harness({
    body: {
      name: "  Anirudh Sharma  ",
      statusMessage: "  Online  ",
      avatarUrl: "   ",
    },
  });
  await updateProfile(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.deepEqual(h.res.body.user, {
    id: userId,
    name: "Anirudh Sharma",
    email: "anirudh@example.com",
    avatarUrl: "",
    statusMessage: "Online",
    lastSeenAt: null,
  });
});

test("updateProfile accepts valid HTTPS avatar URLs", async () => {
  const url = "https://res.cloudinary.com/demo/image/upload/v1/avatar.png";
  mock.method(User, "findByIdAndUpdate", async (_id, update) => ({
    _id: userId,
    name: "Anirudh",
    email: "anirudh@example.com",
    avatarUrl: update.$set.avatarUrl,
    statusMessage: "",
    lastSeenAt: null,
  }));

  const h = harness({ body: { avatarUrl: ` ${url} ` } });
  await updateProfile(h.req, h.res, h.next);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.user.avatarUrl, url);
});
