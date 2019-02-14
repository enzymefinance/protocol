import * as R from 'ramda';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';

const postProcess = async (_, receipt) => {
  const feeReward = R.path(['events', 'FeeReward'], receipt);
  ensure(!!feeReward, 'No FeeReward event found in receipt');
  return true;
};

const triggerRewardAllFees = transactionFactory(
  'triggerRewardAllFees',
  Contracts.Accounting,
  undefined,
  undefined,
  postProcess,
);

export { triggerRewardAllFees };
