import { getGlobalEnvironment } from '~/utils/environment';

import { deployToken, getToken } from '~/contracts/dependencies/token';
import { deploy as deployPriceFeed } from '~/contracts/prices';
import {
  deployMatchingMarket,
  deployMatchingMarketAdapter,
  addTokenPairWhitelist,
  deploy0xExchange,
} from '~/contracts/exchanges';
import { deploy as deployEngine } from '~/contracts/engine';
// tslint:disable:max-line-length
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
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { deploy0xAdapter } from '~/contracts/exchanges/transactions/deploy0xAdapter';
// tslint:enable:max-line-length

export const sessionDeployments = {};

const debug = require('./getDebug').default(__filename);

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async () => {
  const environment = getGlobalEnvironment();
  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0]);
  const mlnTokenAddress = await deployToken('MLN');
  const quoteToken = await getToken(await deployToken('WETH'));
  const baseToken = await getToken(mlnTokenAddress);
  const eurToken = await getToken(await deployToken('EUR'));
  const zrxToken = await getToken(await deployToken('ZRX'));
  const priceFeedAddress = await deployPriceFeed(quoteToken);
  const matchingMarketAddress = await deployMatchingMarket();
  const {
    kyberNetworkAddress,
    kyberNetworkProxyAddress,
    KyberAdapterAddress,
  } = await deployKyberEnvironment(
    accounts[0],
    quoteToken,
    baseToken,
    eurToken,
    environment,
  );

  const zeroExAddress = await deploy0xExchange({ zrxToken });
  const zeroExAdapterAddress = await deploy0xAdapter();

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
    {
      adapterAddress: KyberAdapterAddress,
      exchangeAddress: kyberNetworkProxyAddress,
      name: 'KyberNetwork',
      takesCustody: false,
    },
    {
      adapterAddress: zeroExAdapterAddress,
      exchangeAddress: zeroExAddress,
      name: 'ZeroEx',
      takesCustody: false,
    },
  ];

  const priceSource = priceFeedAddress;

  const addresses = {
    engine: engineAddress,
    exchangeConfigs,
    fundFactory: fundFactoryAddress,
    policies: {
      priceTolerance: priceToleranceAddress,
      whitelist: whitelistAddress,
    },
    priceSource,
    tokens: [quoteToken, baseToken, eurToken, zrxToken],
    version: versionAddress,
  };

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  debug('Deployed:', deploymentId, addresses);

  sessionDeployments[deploymentId] = addresses;

  return addresses;
};
