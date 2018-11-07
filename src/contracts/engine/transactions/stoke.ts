import { Address } from '~/utils/types';
import {
  prepareTransaction,
  sendTransaction,
  getContract,
  Contract,
} from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { BigNumber } from 'bignumber.js';

const guards = async (engineAddress: Address, environment) => {
  const engine = getContract(Contract.Engine, engineAddress);
  const now = new BigNumber(Math.floor(new Date().getTime() / 1000));
  const lastStoke = new BigNumber(await engine.methods.lastStoke().call());
  const stokingDelay = new BigNumber(
    await engine.methods.stokingDelay().call(),
  );
  const frozenEther = await engine.methods.frozenEther().call();

  ensure(
    now >= stokingDelay.plus(lastStoke),
    'Not enough time has passed since the last stoke',
  );
  ensure(frozenEther > new BigNumber(0), 'No frozen ether to thaw');
};

const prepare = async (engineAddress: Address, environment) => {
  const contract = getContract(Contract.Engine, engineAddress);
  const transaction = contract.methods.stoke();
  transaction.name = 'stoke';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const validateReceipt = receipt => {
  return true;
};

export const stoke = async (engineAddress: Address, environment?) => {
  await guards(engineAddress, environment);
  const transaction = await prepare(engineAddress, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
