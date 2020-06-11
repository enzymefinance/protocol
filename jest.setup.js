import { BN } from 'web3-utils';
import { matcherHint, printExpected, printReceived } from 'jest-matcher-utils';
const ganache = require('ganache-core');
const Web3 = require('web3');

// Default timeout interval for tests and before/after hooks
jest.setTimeout(1200000); // 20 mins

// TODO: factor these keys into one place
const pkeys = [
  // '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721',
  // '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011',
  // '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56',
  '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721',
  '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011',
  '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56',
  '0x1a4b1a2941ef98ab3e8aa83572bc81d8fe178a2d21ee42b888fd0597848746de',
  '0xb5556102fef8ffc4e044cd6708039787ed97bb5860fd1bff2fcac88d77ff70eb',
  '0x35dae058318c0869a4bd3acc659e345a60d71aa86d37b6ba299391e86d6e0b21',
  '0xba830c02b1aff9bc5a6e194bab37a3865e26bc5b33402c6f292552c7f89f9732',
  '0x6750fdc727aeb0854e57018b02e0e144820d15eed1a9e950fff367484e93aa48',
  '0x071570dd341ce1056771af8f4efd0fe3a0874eacc10228b9c4d626b007102e21',
  '0x2760966c32dd5179176ab8066895148f2bdfa3072427b9904660a0555d1c32e7'
];

// TODO: can all of this config be hoisted to the first fork?
global.startChain = async () => {
  const startingBalance = Web3.utils.toWei('10000000', 'ether');
  const provider = ganache.provider({
    fork: 'http://127.0.0.1:8545', // TODO: get from config
    mnemonic: 'exhibit now news planet fame thank swear reform tilt accident bitter axis',
    // vmErrorsOnRPCResponse: true,
    network_id: 1,
    gasLimit: '0x989680',
    // TODO: make less redundant with test-chain.js
    unlocked_accounts: [
      '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d', // MLN whale
      '0x3eb01b3391ea15ce752d01cf3d3f09dec596f650', // KNC whale
      '0xa57bd00134b2850b2a1c55860c9e9ea100fdd6cf', // ZRX reserve operator
      '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', // ZRX whale
      '0x7D3455421BbC5Ed534a83c88FD80387dc8271392', // ZRX Governor contract
    ],
    accounts: [
      {
        secretKey: pkeys[0],
        balance: startingBalance,
      }, {
        secretKey: pkeys[1],
        balance: startingBalance,
      }, {
        secretKey: pkeys[2],
        balance: startingBalance,
      }, {
        secretKey: pkeys[3],
        balance: startingBalance,
      }, {
        secretKey: pkeys[4],
        balance: startingBalance,
      },
    ],
  });

  const web3 = new Web3(provider, null, { transactionConfirmationBlocks: 1 });

  for (const pkey of pkeys) {
    web3.eth.accounts.wallet.add(pkey);
  }
  return web3;
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
  bigNumberGtEq(received, expected) {
    const passMessage = (received, expected) => () => {
      return (
        matcherHint('.not.bigNumberGtEq') +
        '\n\n' +
        'Expected and expected.toString() values to not be greater than or equal to:\n' +
        `  ${printExpected(expected)} ${printExpected(expected.toString())}\n` +
        'Received and received.toString():\n' +
        `  ${printReceived(received)} ${printReceived(received.toString())}`
      );
    };

    const failMessage = (received, expected) => () => {
      return (
        matcherHint('.bigNumberGtEq') +
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

    const pass = received.gte(expected);

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
