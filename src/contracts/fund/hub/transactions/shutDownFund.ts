import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import { Contracts } from '~/Contracts';
import { ensureIsManager } from '~/contracts/fund/hub/guards/ensureIsManager';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';

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
