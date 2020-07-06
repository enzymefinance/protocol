expect.extend({
  toHaveBeenCalledOnContract(contract, method) {
    const name = contract.constructor.name;
    if (method != null && !contract.interface.getFunction(method)) {
      throw new Error(`Invalid function ${method} for contract ${name}`);
    }

    const signature = method ? contract.interface.getSighash(method) : '0x';
    const provider = contract.$$ethers.provider;
    const address = contract.$$ethers.address;
    const pass = provider.history.calls(address).some((call) => call.startsWith(signature));

    const message = pass
      ? () => `expect(${name}).not.toHaveBeenCalledOnContract(${method ? `, '${method}'` : ''})`
      : () => `expect(${name}).toHaveBeenCalledOnContract(${method ? `, '${method}'` : ''})`;

    return {
      actual: pass,
      pass,
      message,
    };
  },
  toHaveBeenCalledOnContractTimes(contract, times, method) {
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
          `Expected: ${this.utils.printExpected(`${times} times`)}\n` +
          `Actual: ${this.utils.printReceived(`${calls.length} times`)}`
      : () =>
          `expect(${name}).toHaveBeenCalledOnContractTimes(${times}${method ? `, '${method}'` : ''})` +
          '\n\n' +
          `Expected: ${this.utils.printExpected(`${times} times`)}\n` +
          `Actual: ${this.utils.printReceived(`${calls.length} times`)}`

    return {
      actual: pass,
      pass,
      message,
    };
  }
});
