import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { Address } from '@melonproject/token-math/address';
import { createQuantity } from '@melonproject/token-math/quantity';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { signTransaction } from '../environment/signTransaction';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';

describe('transactionFactory', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.token = await getToken(shared.env, await deployToken(shared.env));
    shared.accounts = (await shared.env.eth.getAccounts()).map(
      account => new Address(account),
    );
  });

  it('Skip guards and preflight', async () => {
    const params = {
      howMuch: createQuantity(shared.token, 2000000),
      to: shared.accounts[1],
    };

    await expect(transfer.prepare(shared.env, params)).rejects.toThrow(
      'Insufficient FIXED',
    );

    await expect(
      transfer.prepare(shared.env, params, { skipGuards: true }),
    ).rejects.toThrow('Gas estimation (preflight) failed');

    await expect(
      transfer.prepare(shared.env, params, {
        skipGasEstimation: true,
        skipGuards: true,
      }),
    ).rejects.toThrow(
      'Cannot skip gasEstimation if no options.gas is provided',
    );

    const prepared = await transfer.prepare(shared.env, params, {
      gas: '8000000',
      skipGasEstimation: true,
      skipGuards: true,
    });

    const signedTransactionData = await signTransaction(
      shared.env,
      prepared.rawTransaction,
    );

    await expect(
      transfer.send(shared.env, signedTransactionData, params),
    ).rejects.toThrow('VM Exception while processing transaction: revert');

    await expect(
      transfer(shared.env, params, {
        gas: '8000000',
        skipGasEstimation: true,
        skipGuards: true,
      }),
    ).rejects.toThrow('VM Exception while processing transaction: revert');
  });
});
