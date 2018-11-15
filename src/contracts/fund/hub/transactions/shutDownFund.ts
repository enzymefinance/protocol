import { transactionFactory } from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { Contracts } from '~/Contracts';
import { ensureIsNotShutDown, isShutDown, ensureIsManager } from '../../hub';

const guard = async (params, contractAddress, environment) => {
  await ensureIsNotShutDown(contractAddress, environment);
  await ensureIsManager(contractAddress, environment);
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  const shutDown = await isShutDown(contractAddress, null, environment);
  ensure(shutDown, 'Fund is not shut down');
  return true;
};

const shutDownFund = transactionFactory(
  'shutDownFund',
  Contracts.Hub,
  guard,
  undefined,
  postProcess,
);

export { shutDownFund };
