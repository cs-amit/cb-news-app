// Manual Jest mock for @react-native-async-storage/async-storage, following
// the same <rootDir>/__mocks__/<module> convention as
// __mocks__/expo-notifications.ts (Jest auto-applies this for any test that
// imports the real module — no jest.mock() call needed in test files). The
// real module reaches into RN's native module bridge, which doesn't exist
// under Jest's node test environment, so this delegates to the package's
// own official in-memory Jest mock (an object of jest.fn()s backed by a
// plain JS object) rather than reimplementing one.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mock = require("@react-native-async-storage/async-storage/jest/async-storage-mock");

export default mock;
