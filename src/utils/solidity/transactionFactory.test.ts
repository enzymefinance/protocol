import { initTestEnvironment } from '../environment/initTestEnvironment';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { Address } from '@melonproject/token-math/address';
import { createQuantity } from '@melonproject/token-math/quantity';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { sign } from '../environment/sign';

const shared: { [propName: string]: any } = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.token = await getToken(await deployToken());
  shared.accounts = (await shared.environment.eth.getAccounts()).map(
    account => new Address(account),
  );
});

test('Skip guards and preflight', async () => {
  const params = {
    howMuch: createQuantity(shared.token, 2000000),
    to: shared.accounts[1],
  };

  await expect(transfer.prepare(params)).rejects.toThrow('Insufficient FIXED');

  await expect(transfer.prepare(params, { skipGuards: true })).rejects.toThrow(
    'Gas estimation (preflight) failed',
  );

  await expect(
    transfer.prepare(params, {
      skipGasEstimation: true,
      skipGuards: true,
    }),
  ).rejects.toThrow('Cannot skip gasEstimation if no options.gas is provided');

  const prepared = await transfer.prepare(params, {
    gas: '8000000',
    skipGasEstimation: true,
    skipGuards: true,
  });

  const signedTransactionData = await sign(
    prepared.rawTransaction,
    shared.environment,
  );

  await expect(transfer.send(signedTransactionData, params)).rejects.toThrow(
    'VM Exception while processing transaction: revert',
  );

  await expect(
    transfer(params, shared.environment, {
      gas: '8000000',
      skipGasEstimation: true,
      skipGuards: true,
    }),
  ).rejects.toThrow('VM Exception while processing transaction: revert');
});
