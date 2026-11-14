# Testing Utilities

This folder contains code that is **only** used for testing the `fern-chat` application. None of these files are imported by production code, so they will never affect the `main` branch.

## Files

- **test-utils.js** – helper functions (`mockUser`, `delay`, `testLog`, `IS_TESTING`).
- **mock-server.js** – a tiny Express server that can be started in integration tests.
- **fixtures/** – JSON payloads useful for unit tests.
- **jest.config.js** – custom Jest configuration for the test suite.
- **setupTests.js** – global setup/teardown for tests (starts the mock server).

## How to use

```js
import { mockUser, delay, testLog } from "../testing/test-utils";

test('example', async () => {
  const user = mockUser();
  testLog('Created mock user');
  await delay(100);
  expect(user.id).toMatch(/^test-user-/);
});
```

When you run `npm test` the `testing/setupTests.js` will automatically start the mock server.

---
*These utilities are deliberately kept out of the production build.*
