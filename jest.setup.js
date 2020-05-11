import { BN } from 'web3-utils';
import { matcherHint, printExpected, printReceived } from 'jest-matcher-utils';
const ganache = require('ganache-core');
const Web3 = require('web3');

// Default timeout interval for tests and before/after hooks
jest.setTimeout(1200000); // 20 mins

// TODO: factor these keys into one place
const PRIV_KEY_1 = '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721';
const PRIV_KEY_2 = '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011';
const PRIV_KEY_3 = '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56';

global.startChain = async () => {
  // const startingBalance = Web3.utils.toWei('1000', 'ether');
  const provider = ganache.provider({
    fork: 'http://127.0.0.1:8545',
    // network_id: 1,
    // accounts: [
    //   {
    //     secretKey: PRIV_KEY_1,
    //     balance: startingBalance,
    //   }, {
    //     secretKey: PRIV_KEY_2,
    //     balance: startingBalance,
    //   }, {
    //     secretKey: PRIV_KEY_3,
    //     balance: startingBalance,
    //   },
    // ],
  });

  return new Web3(provider, null, { transactionConfirmationBlocks: 1 });
}

expect.extend({
  bigNumberCloseTo(received, expected, margin = new BN(100)) {
    const passMessage = (received, expected) => () => {
      return (
        matcherHint('.not.bigNumberCloseTo') +
        '\n\n' +
        'Expected and expected.toString() values to not be close:\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    const failMessage = (received, expected) => () => {
      return (
        matcherHint('.bigNumberCloseTo') +
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
    if (!BN.isBN(margin)) {
      throw "Margin is not a BN.";
    }

    const pass = received.gt(expected) ?
      expected.add(margin).gt(received) :
      received.add(margin).gt(expected)

    return {
      pass,
      message: pass ? passMessage(received, expected) : failMessage(received, expected),
      actual: received,
    };
  },
});

expect.extend({
  bigNumberEq(received, expected) {
    const passMessage = (received, expected) => () => {
      return (
        matcherHint('.not.bigNumberEq') +
        '\n\n' +
        'Expected and expected.toString() values to not be equal:\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    const failMessage = (received, expected) => () => {
      return (
        matcherHint('.bigNumberEq') +
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

expect.extend({
  toThrowFlexible(e, subString = null) {
    const passMessage = (e, subString) => () => {
      return (
        matcherHint('.not.toThrowFlexible') +
        '\n\n' +
        subString ? (
          'Expected to not throw with substring:\n' +
          `  ${printExpected(subString)}\n` +
          'Full error message:\n' +
          `  ${printReceived(e.message)}`
        ) : (
          'Expected to not throw, but received error:\n' +
          `  ${printExpected(e)}`
        )
      );
    };

    const failMessage = (e, isError, subString) => () => {
      return (
        matcherHint('.toThrowFlexible') +
        '\n\n' +
        isError ? (
          'Expected error with substring:\n' +
          `  ${printExpected(subString)}\n` +
          'Received message:\n' +
          `  ${printReceived(e)}`
        ) : (
          'Expected error but received:\n' +
          `  ${printReceived(e)}`
        )
      );
    };

    const hasMessage =
      e !== null && e !== undefined && typeof e.message === 'string';
    const isError =
      hasMessage && typeof e.name === 'string' && typeof e.stack === 'string';

    let pass = false;
    const infuraErrorMessage = 'Transaction has been reverted by the EVM';
    if (
      isError &&
      (
        !subString ||
        e.message.includes(subString) ||
        e.message.includes(infuraErrorMessage)
      )
    ) {
      pass = true;
    }

    return {
      pass,
      message: pass ? passMessage(e, subString) : failMessage(e, isError, subString)
    };
  },
});
