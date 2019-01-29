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
          `Expected ${
            comparator.name
          } to return false. Received: \n '${JSON.stringify(
            received,
            null,
            2,
          )}' \n expected: \n ${JSON.stringify(expected, null, 2)})`,
        pass: true,
      }
    : {
        message: () =>
          `Expected ${
            comparator.name
          } to return true. Received: \n '${JSON.stringify(
            received,
            null,
            2,
          )}'  \n expected: \n ${JSON.stringify(expected, null, 2)}`,
        pass: false,
      };

export { toBeTrueWith };
