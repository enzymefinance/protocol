import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import { Contracts } from '~/Contracts';
import { ensureIsManager } from '~/contracts/fund/hub/guards/ensureIsManager';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';

const guard = async (environment, params) => {
  await ensureIsNotShutDown(environment, `${params.hub}`);
  await ensureIsManager(environment, `${params.hub}`);
};

const prepareArgs = async (_, { hub }) => [`${hub}`];

const postProcess = async (environment, receipt, params) => {
  const shutDown = await isShutDown(environment, `${params.hub}`, null);
  ensure(shutDown, 'Fund is not shut down');
  return true;
};

const shutDownFund = transactionFactory(
  'shutDownFund',
  Contracts.Version,
  guard,
  prepareArgs,
  postProcess,
);

export { shutDownFund };
