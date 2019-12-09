import { BN } from 'web3-utils';
import { matcherHint, printExpected, printReceived } from 'jest-matcher-utils';
// Allow asynchronous operations (async/await) as long as 2 minutes.
jest.setTimeout(240000);

expect.extend({
  toEqualBN(received, expected) {
    const passMessage = (received, expected) => () => {
      return (
        matcherHint('.not.toEqualBN') +
        '\n\n' +
        'Expected and expected.toString() values to not be equal:\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    const failMessage = (received, expected) => () => {
      return (
        matcherHint('.toEqualBN') +
        '\n\n' +
        'Expected and expected.toString():\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    if (!BN.isBN(received) || !BN.isBN(expected)) {
      throw "Expected or received is not a BN.";
    }

    const pass = received.eq(expected);

    return {
      pass,
      message: pass ? passMessage(received, expected) : failMessage(received, expected),
      actual: received,
    };
  },
});

expect.extend({
  bigNumberGt(received, expected) {
    const passMessage = (received, expected) => () => {
      return (
        matcherHint('.not.bigNumberGt') +
        '\n\n' +
        'Expected and expected.toString() values to not be greater than:\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    const failMessage = (received, expected) => () => {
      return (
        matcherHint('.bigNumberGt') +
        '\n\n' +
        'Expected and expected.toString():\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    if (!BN.isBN(received) || !BN.isBN(expected)) {
      throw "Expected or received is not a BN.";
    }

    const pass = received.gt(expected);

    return {
      pass,
      message: pass ? passMessage(received, expected) : failMessage(received, expected),
      actual: received,
    };
  },
});

expect.extend({
  bigNumberLt(received, expected) {
    const passMessage = (received, expected) => () => {
      return (
        matcherHint('.not.bigNumberLt') +
        '\n\n' +
        'Expected and expected.toString() values to not be less than:\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    const failMessage = (received, expected) => () => {
      return (
        matcherHint('.bigNumberLt') +
        '\n\n' +
        'Expected and expected.toString():\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    if (!BN.isBN(received) || !BN.isBN(expected)) {
      throw "Expected or received is not a BN.";
    }

    const pass = received.lt(expected);

    return {
      pass,
      message: pass ? passMessage(received, expected) : failMessage(received, expected),
      actual: received,
    };
  },
});
