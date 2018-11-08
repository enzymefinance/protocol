import { Address } from '~/utils/types';
import {
  prepareTransaction,
  sendTransaction,
  getContract,
} from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { BigNumber } from 'bignumber.js';
import { Contracts } from '~/Contracts';

const guards = async (engineAddress: Address, environment) => {
  const engine = getContract(Contracts.Engine, engineAddress);
  const now = new BigNumber(Math.floor(new Date().getTime() / 1000));
  const lastThaw = new BigNumber(await engine.methods.lastThaw().call());
  const thawingDelay = new BigNumber(
    await engine.methods.thawingDelay().call(),
  );
  const frozenEther = await engine.methods.frozenEther().call();

  ensure(
    now >= thawingDelay.plus(lastThaw),
    'Not enough time has passed since the last thaw',
  );
  ensure(frozenEther > new BigNumber(0), 'No frozen ether to thaw');
};

const prepare = async (engineAddress: Address, environment) => {
  const contract = getContract(Contracts.Engine, engineAddress);
  const transaction = contract.methods.thaw();
  transaction.name = 'thaw';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const validateReceipt = receipt => {
  return true;
};

export const thaw = async (engineAddress: Address, environment?) => {
  await guards(engineAddress, environment);
  const transaction = await prepare(engineAddress, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
