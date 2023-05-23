import type { providers } from 'ethers';

export function forceFail(error: string | (() => string), invert: boolean): jest.CustomMatcherResult {
  const pass = !!invert;
  const message = typeof error === 'function' ? error : () => error;

  return { message, pass };
}

export function forcePass(invert: boolean): jest.CustomMatcherResult {
  const pass = !invert;

  return { message: () => '', pass };
}

export function isTransactionReceipt(value: any): value is providers.TransactionReceipt {
  try {
    expect(value).toMatchObject({
      blockHash: expect.any(String),
      blockNumber: expect.any(Number),
      confirmations: expect.any(Number),
      cumulativeGasUsed: expect.any(Object),
      from: expect.any(String),
      gasUsed: expect.any(Object),
      logsBloom: expect.any(String),
      to: expect.any(String),
      transactionHash: expect.any(String),
      transactionIndex: expect.any(Number),
    });
  } catch {
    return false;
  }

  return true;
}
