import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import * as web3Utils from 'web3-utils';

const postProcess = async (receipt, params, contractAddress, environment) => {
  const stakingFeedAddress =
    receipt.events.SetupPriceFeed.returnValues.ofPriceFeed;

  return web3Utils.toChecksumAddress(stakingFeedAddress);
};

const setupPriceFeed = transactionFactory(
  'setupStakingPriceFeed',
  Contracts.CanonicalPriceFeed,
  undefined,
  undefined,
  postProcess,
);

export default setupPriceFeed;
