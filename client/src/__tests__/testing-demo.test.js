// testing-demo.test.js – demonstrates the testing utilities added in the testing branch

import { mockUser, delay, testLog, IS_TESTING } from "../../testing/test-utils";

/**
 * Simple test that verifies the mockUser helper works and that the
 * IS_TESTING flag is true. This file exists only to prove that the
 * testing utilities are usable from the test suite.
 */

test('testing utilities demo', async () => {
  // Ensure the flag is true – this would be false in production code.
  expect(IS_TESTING).toBe(true);

  const user = mockUser({ name: "Demo User" });
  testLog(`Created mock user: ${user.name}`);

  // Simulate an async operation.
  await delay(10);

  // Basic assertions.
  expect(user.id).toMatch(/^test-user-/);
  expect(user.email).toContain("@example.com");
});
