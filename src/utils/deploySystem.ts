import initTestEnvironment from '~/utils/environment/initTestEnvironment';

import {
  deploy as deployToken,
  getToken,
} from '~/contracts/dependencies/token';
import { deploy as deployPriceFeed } from '~/contracts/prices';
import { deploy as deployMatchingMarket } from '~/contracts/exchanges';
import { addTokenPairWhitelist } from '~/contracts/exchanges';

/**
 * Deploys all contracts and checks their health
 */
const deploySystem = async () => {
  const quoteTokenAddress = await deployToken('DAI');
  const baseTokenAddress = await deployToken('MLN');
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const priceFeedAddress = await deployPriceFeed(quoteToken);
  const matchingMarketAddress = await deployMatchingMarket();
  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });
};

if (require.main === module) {
  // compile("exchanges/MatchingMarket.sol");
  initTestEnvironment().then(async () => {
    await deploySystem();
    process.exit();
  });
}

export default deploySystem;
