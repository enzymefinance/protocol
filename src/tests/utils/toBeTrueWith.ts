declare global {
  namespace jest {
    interface Matchers<R> {
      toBeTrueWith: (comparator: Function, expected: any) => {};
    }
  }
}

const toBeTrueWith = (received, comparator, expected) =>
  comparator(received, expected)
    ? {
        message: () =>
          `Expected ${comparator.name} to return false with: ('${JSON.stringify(
            received,
          )}', '${JSON.stringify(expected)}')`,
        pass: true,
      }
    : {
        message: () =>
          `Expected ${comparator.name} to return true with: ('${JSON.stringify(
            received,
          )}', '${JSON.stringify(expected)}')`,
        pass: false,
      };

export { toBeTrueWith };
