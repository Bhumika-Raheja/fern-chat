// test-utils.js – utilities used only in the "testing" branch

/**
 * Generates a mock user object for UI testing.
 * This helper is intentionally kept out of the main codebase so that
 * production builds are not affected.
 */
export function mockUser(overrides = {}) {
  return {
    id: "test-user-123",
    name: "Test User",
    email: "test@example.com",
    avatarUrl: "https://www.example.com/avatar.png",
    ...overrides,
  };
}

/**
 * Simple delay helper for integration tests.
 * Usage: await delay(200);
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Logs a message prefixed with [TEST] so it is easy to filter in CI logs.
 */
export function testLog(message) {
  // eslint-disable-next-line no-console
  console.log(`[TEST] ${message}`);
}

// Export a constant that can be imported to conditionally enable test-only routes.
export const IS_TESTING = true;
