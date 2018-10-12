import initTestEnvironment from '~/utils/environment/initTestEnvironment';
import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

import {
  deploy as deployToken,
  getToken,
} from '~/contracts/dependencies/token';
import { deploy as deployPriceFeed } from '~/contracts/prices';
import {
  deployMatchingMarket,
  deployMatchingMarketAdapter,
} from '~/contracts/exchanges';
import { addTokenPairWhitelist } from '~/contracts/exchanges';
import { deploy as deployPriceTolerance } from '~/contracts/fund/risk-management';
import { deployWhitelist } from '~/contracts/fund/compliance';
import { deployAccountingFactory } from '~/contracts/fund/accounting';
import { deployFeeManagerFactory } from '~/contracts/fund/fees';
import { deployParticipationFactory } from '~/contracts/fund/participation';
import { deploySharesFactory } from '~/contracts/fund/shares';

/**
 * Deploys all contracts and checks their health
 */
const deploySystem = async () => {
  const globalEnvironment = getGlobalEnvironment();
  const quoteTokenAddress = await deployToken('DAI');
  const baseTokenAddress = await deployToken('MLN');
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const priceFeedAddress = await deployPriceFeed(quoteToken);
  const matchingMarketAddress = await deployMatchingMarket();
  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });
  const priceToleranceAddress = await deployPriceTolerance(10);
  const whitelistAddress = await deployWhitelist([
    globalEnvironment.wallet.address,
  ]);
  const matchingMarketAdapterAddress = await deployMatchingMarketAdapter();
  const accountingFactoryAddress = await deployAccountingFactory();
  const feeManagerFactoryAddress = await deployFeeManagerFactory();
  const participationFactoryAddress = await deployParticipationFactory();
  const sharesFactoryAddress = await deploySharesFactory();
};

if (require.main === module) {
  // compile("exchanges/MatchingMarket.sol");
  initTestEnvironment().then(async () => {
    await deploySystem();
    process.exit();
  });
}

export default deploySystem;
