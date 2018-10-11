import initTestEnvironment from '~/utils/environment/initTestEnvironment';

import {
  deploy as deployToken,
  getToken,
} from '~/contracts/dependencies/token';
import { deploy as deployPriceFeed } from '~/contracts/prices';
import { deploy as deployMatchingMarket } from '~/contracts/exchanges';

/**
 * Deploys all contracts and checks their health
 */
const deploySystem = async () => {
  const quoteAssetAddress = await deployToken('DAI');
  const secondAssetAddress = await deployToken('MLN');
  const quoteAsset = await getToken(quoteAssetAddress);
  const secondAsset = await getToken(secondAssetAddress);
  const priceFeedAddress = await deployPriceFeed(quoteAsset);
  const matchingMarketAddress = await deployMatchingMarket();
};

if (require.main === module) {
  // compile("exchanges/MatchingMarket.sol");
  initTestEnvironment().then(async () => {
    await deploySystem();
  });
}

export default deploySystem;
