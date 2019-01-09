import { Address } from '@melonproject/token-math/address';
import { ensureSameToken } from '@melonproject/token-math/token';
import { isEqual, greaterThan } from '@melonproject/token-math/quantity';

import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { getContract } from '~/utils/solidity/getContract';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { allowance } from '~/contracts/dependencies/token/calls/allowance';
import { ensure } from '~/utils/guards/ensure';
import { Contracts } from '~/Contracts';

const guard = async (environment, { quantity }, contractAddress: Address) => {
  const engine = getContract(environment, Contracts.Engine, contractAddress);
  const mlnAddress = await engine.methods.mlnToken().call();
  const mlnToken = await getToken(environment, mlnAddress);
  ensureSameToken(quantity.token, mlnToken);
  const allowedMln = await allowance(environment, mlnAddress, {
    owner: environment.wallet.address,
    spender: contractAddress.toString(),
  });

  ensure(
    isEqual(allowedMln, quantity) || greaterThan(allowedMln, quantity),
    `Amount must be approved prior to calling this function.`,
  );
};

const prepareArgs = async (_, { quantity }) => {
  return [`${quantity.quantity}`];
};

const postProcess = async (_, receipt) => receipt;

// Gas behaves kinda weird for this function:
// Estimation: 88289, Effective usage: 58289
// const options = { gas: '89399' };
// NOTE: Fixed with gas boost

export const sellAndBurnMln = transactionFactory(
  'sellAndBurnMln',
  Contracts.Engine,
  guard,
  prepareArgs,
  postProcess,
  // options,
);
