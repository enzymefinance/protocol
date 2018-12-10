import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const postProcess = async receipt => receipt;

const withdrawStake = transactionFactory(
  'withdrawStake',
  Contracts.StakingPriceFeed,
  undefined,
  undefined,
  postProcess,
);

export default withdrawStake;
