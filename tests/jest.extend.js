const { ethers } = require("ethers");

function contractCalled(contract, method) {
  const name = contract.constructor.name;
  if (method != null && !contract.interface.getFunction(method)) {
    throw new Error(`Invalid function ${method} for contract ${name}`);
  }

  const signature = method ? contract.interface.getSighash(method) : '0x';
  const provider = contract.$$ethers.provider;
  const address = contract.$$ethers.address;
  const calls = provider.history.calls(address).filter((call) => call.startsWith(signature));
  const pass = calls.length !== 0;

  const message = pass
    ? () =>
      `expect(${name}).not.toHaveBeenCalledOnContract(${method ? `, '${method}'` : ''})` +
      '\n\n' +
      `Expected: ${this.utils.printExpected('Function should not be called')}\n` +
      `Actual: ${this.utils.printReceived(`Function was called ${calls.length} times`)}`
    : () =>
      `expect(${name}).toHaveBeenCalledOnContract(${method ? `, '${method}'` : ''})` +
      '\n\n' +
      `Expected: ${this.utils.printExpected('Function should have been called')}\n` +
      `Actual: ${this.utils.printReceived(`Function was not called`)}`

  return { pass, message };
}

function contractCalledTimes(contract, times, method) {
  const name = contract.constructor.name;
  if (method != null && !contract.interface.getFunction(method)) {
    throw new Error(`Invalid function ${method} for contract ${name}`);
  }

  const signature = method ? contract.interface.getSighash(method) : '0x';
  const provider = contract.$$ethers.provider;
  const address = contract.$$ethers.address;

  const calls = provider.history.calls(address).filter((call) => call.startsWith(signature));
  const pass = calls.length === times;

  const message = pass
    ? () =>
      `expect(${name}).not.toHaveBeenCalledOnContractTimes(${times}${method ? `, '${method}'` : ''})` +
      '\n\n' +
      `Expected: ${this.utils.printExpected(`Function should be called ${times} times`)}\n` +
      `Actual: ${this.utils.printReceived(`Function was called ${calls.length} times`)}`
    : () =>
      `expect(${name}).toHaveBeenCalledOnContractTimes(${times}${method ? `, '${method}'` : ''})` +
      '\n\n' +
      `Expected: ${this.utils.printExpected(`Function should be called ${times} times`)}\n` +
      `Actual: ${this.utils.printReceived(`Function was called ${calls.length} times`)}`;

  return { pass, message };
}

async function transactionReverts(tx) {
  try {
    const receipt = await tx;
    if (!receipt.transactionHash) {
      throw new Error('Received invalid transaction receipt');
    }
  } catch (error) {
    const errorMessage = (error instanceof Object && 'message' in error) ? error.message : JSON.stringify(error);
    const hasReverted = errorMessage.search('revert') !== -1;
    const hasThrown = errorMessage.search('invalid opcode') !== -1;
    const hasError = errorMessage.search('code=') !== -1;

    if (hasReverted || hasThrown || hasError) {
      const message = () =>
        `expect(transaction).not.toRevert()` +
        '\n\n' +
        `Expected: ${this.utils.printExpected('To not revert')}\n` +
        `Actual: ${this.utils.printReceived(`Reverted with error`)}\n` +
        `Error:` +
        '\n\n' +
        `${errorMessage}`;

      return { pass: true, message };
    }

    throw error;
  }

  const message = () =>
    `expect(transaction).toRevert()` +
    '\n\n' +
    `Expected: ${this.utils.printExpected('To revert')}\n` +
    `Actual: ${this.utils.printReceived(`Did not revert`)}`

  return { pass: false, message };
}

async function transactionRevertsWith(tx, search) {
  try {
    const receipt = await tx;
    if (!receipt.transactionHash) {
      throw new Error('Received invalid transaction receipt');
    }
  } catch (error) {
    const errorMessage = (error instanceof Object && 'message' in error) ? error.message : JSON.stringify(error);
    const hasReverted = errorMessage.search('revert') !== -1;
    const hasThrown = errorMessage.search('invalid opcode') !== -1;
    const hasError = errorMessage.search('code=') !== -1;
    const hasMatch = errorMessage.match(search) !== null;

    if ((hasReverted || hasThrown || hasError) && hasMatch) {
      const message = () =>
        `expect(transaction, search).not.toRevert()` +
        '\n\n' +
        `Expected: ${this.utils.printExpected(`To not revert with error matching '${search}'`)}\n` +
        `Actual: ${this.utils.printReceived(`Reverted with error matching '${search}'`)}\n` +
        `Error:` +
        '\n\n' +
        `${errorMessage}`;

      return { pass: true, message };
    }

    throw error;
  }

  const message = () =>
    `expect(transaction).toRevert()` +
    '\n\n' +
    `Expected: ${this.utils.printExpected(`To revert with error matching '${search}'`)}\n` +
    `Actual: ${this.utils.printReceived(`Did not revert with error matching '${search}'`)}`;

  return { pass: false, message };
}


function bigNumberEq(received, expected) {
  if (!ethers.BigNumber.isBigNumber(received)) {
    throw new Error('Received value is not ethers.BigNumberish');
  }

  if (!ethers.BigNumber.isBigNumber(expected)) {
    throw new Error('Expected value is not ethers.BigNumberish');
  }

  const pass = received.eq(expected);
  const message = () => pass
    ? this.utils.matcherHint('.not.bigNumberEq') +
      '\n\n' +
      'Not expected:\n' +
      `  ${this.utils.printExpected(expected.toString())}\n` +
      'Received:\n' +
      `  ${this.utils.printReceived(received.toString())}`
    : this.utils.matcherHint('.bigNumberEq') +
      '\n\n' +
      'Expected:\n' +
      `  ${this.utils.printExpected(expected.toString())}\n` +
      'Received:\n' +
      `  ${this.utils.printReceived(received.toString())}`;

  return { pass, message };
}

expect.extend({
  contractCalled,
  contractCalledTimes,
  transactionReverts,
  transactionRevertsWith,
  bigNumberEq,
});
