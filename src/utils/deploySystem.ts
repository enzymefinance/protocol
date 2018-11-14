import { getGlobalEnvironment } from '~/utils/environment';

import {
  deploy as deployToken,
  getToken,
} from '~/contracts/dependencies/token';
import { deploy as deployPriceFeed } from '~/contracts/prices';
import {
  deployMatchingMarket,
  deployMatchingMarketAdapter,
  addTokenPairWhitelist,
} from '~/contracts/exchanges';
import { deploy as deployEngine } from '~/contracts/engine';
// tslint:disable-next-line:max-line-length
import { deploy as deployPriceTolerance } from '~/contracts/fund/risk-management';
import { deployWhitelist } from '~/contracts/fund/compliance';
import { deployAccountingFactory } from '~/contracts/fund/accounting';
import { deployFeeManagerFactory } from '~/contracts/fund/fees';
import { deployParticipationFactory } from '~/contracts/fund/participation';
import { deploySharesFactory } from '~/contracts/fund/shares';
import { deployTradingFactory } from '~/contracts/fund/trading';
import { deployVaultFactory } from '~/contracts/fund/vault';
import { deployPolicyManagerFactory } from '~/contracts/fund/policies';
import { deployFundFactory } from '~/contracts/factory';
import { deployMockVersion, setFundFactory } from '~/contracts/version';

const debug = require('./getDebug').default(__filename);

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async () => {
  const environment = getGlobalEnvironment();
  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0]);
  const quoteTokenAddress = await deployToken('ETH');
  const mlnTokenAddress = await deployToken('MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const priceFeedAddress = await deployPriceFeed(quoteToken);
  const matchingMarketAddress = await deployMatchingMarket();

  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });

  const priceToleranceAddress = await deployPriceTolerance(10);
  const whitelistAddress = await deployWhitelist([accounts[0]]);
  const versionAddress = await deployMockVersion();
  const matchingMarketAdapterAddress = await deployMatchingMarketAdapter();
  const accountingFactoryAddress = await deployAccountingFactory();
  const feeManagerFactoryAddress = await deployFeeManagerFactory();
  const participationFactoryAddress = await deployParticipationFactory();
  const sharesFactoryAddress = await deploySharesFactory();
  const tradingFactoryAddress = await deployTradingFactory();
  const vaultFactoryAddress = await deployVaultFactory();
  const policyManagerFactoryAddress = await deployPolicyManagerFactory();
  const monthInSeconds = 30 * 24 * 60 * 60;
  const engineAddress = await deployEngine(
    versionAddress,
    priceFeedAddress,
    monthInSeconds,
    mlnTokenAddress,
  );

  const fundFactoryAddress = await deployFundFactory({
    accountingFactoryAddress,
    engineAddress,
    factoryPriceSourceAddress: priceFeedAddress,
    feeManagerFactoryAddress,
    mlnTokenAddress,
    participationFactoryAddress,
    policyManagerFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    versionAddress,
  });

  await setFundFactory(versionAddress, { address: fundFactoryAddress });

  const exchangeConfigs = [
    {
      adapterAddress: matchingMarketAdapterAddress,
      exchangeAddress: matchingMarketAddress,
      name: 'MatchingMarket',
      takesCustody: false,
    },
  ];

  const priceSource = priceFeedAddress;

  const addresses = {
    exchangeConfigs,
    fundFactory: fundFactoryAddress,
    policies: {
      priceTolerance: priceToleranceAddress,
      whitelist: whitelistAddress,
    },
    priceSource,
    tokens: [quoteToken, baseToken],
    version: versionAddress,
  };

  debug('Deployed:', addresses);

  return addresses;
};
