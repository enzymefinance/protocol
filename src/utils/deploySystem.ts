// tslint:disable:max-line-length
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deploy as deployPriceFeed } from '~/contracts/prices/transactions/deploy';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deploy as deployEngine } from '~/contracts/engine/transactions/deploy';
import { deploy as deployPriceTolerance } from '~/contracts/fund/policies/risk-management/transactions/deploy';
import { deployWhitelist } from '~/contracts/fund/policies/compliance/transactions/deployWhitelist';
import { deployAccountingFactory } from '~/contracts/fund/accounting/transactions/deployAccountingFactory';
import { deployFeeManagerFactory } from '~/contracts/fund/fees/transactions/deployFeeManagerFactory';
import { deployParticipationFactory } from '~/contracts/fund/participation/transactions/deployParticipationFactory';
import { deploySharesFactory } from '~/contracts/fund/shares/transactions/deploySharesFactory';
import { deployTradingFactory } from '~/contracts/fund/trading/transactions/deployTradingFactory';
import { deployVaultFactory } from '~/contracts/fund/vault/transactions/deployVaultFactory';
import { deployPolicyManagerFactory } from '~/contracts/fund/policies/transactions/deployPolicyManagerFactory';
import { deployFundFactory } from '~/contracts/factory/transactions/deployFundFactory';
import { deployMockVersion } from '~/contracts/version/transactions/deployMockVersion';
import { setFundFactory } from '~/contracts/version/transactions/setFundFactory';
import { setSessionDeployment } from './sessionDeployments';
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { deploy0xAdapter } from '~/contracts/exchanges/transactions/deploy0xAdapter';
import { deploy0xExchange } from '~/contracts/exchanges/transactions/deploy0xExchange';
import { Exchanges } from '~/Contracts';
import { deployEthfinex } from '~/contracts/exchanges/transactions/deployEthfinex';
import { deployEthfinexAdapter } from '~/contracts/exchanges/transactions/deployEthfinexAdapter';
// tslint:enable:max-line-length

const debug = require('debug')('melon:protocol:utils');

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
    kyberNetworkProxyAddress,
    KyberAdapterAddress,
  } = await deployKyberEnvironment(
    accounts[0],
    quoteToken,
    baseToken,
    eurToken,
    environment,
  );

  const tokens = [quoteToken, baseToken, eurToken, zrxToken];

  const zeroExAddress = await deploy0xExchange({ zrxToken });
  const zeroExAdapterAddress = await deploy0xAdapter();

  const ethfinexDeploy = await deployEthfinex({ tokens }, environment);
  const ethfinexAdapterAddress = await deployEthfinexAdapter();

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
      name: Exchanges.MatchingMarket,
      takesCustody: false,
    },
    {
      adapterAddress: KyberAdapterAddress,
      exchangeAddress: kyberNetworkProxyAddress,
      name: Exchanges.KyberNetwork,
      takesCustody: false,
    },
    {
      adapterAddress: zeroExAdapterAddress,
      exchangeAddress: zeroExAddress,
      name: Exchanges.ZeroEx,
      takesCustody: false,
    },
    {
      adapterAddress: ethfinexAdapterAddress,
      exchangeAddress: ethfinexDeploy.exchange,
      name: Exchanges.Ethfinex,
      takesCustody: true,
    },
  ];

  const priceSource = priceFeedAddress;

  const addresses = {
    engine: engineAddress,
    ethfinex: ethfinexDeploy,
    exchangeConfigs,
    fundFactory: fundFactoryAddress,
    policies: {
      priceTolerance: priceToleranceAddress,
      whitelist: whitelistAddress,
    },
    priceSource,
    tokens,
    version: versionAddress,
  };

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  debug('Deployed:', deploymentId, addresses);

  setSessionDeployment(deploymentId, addresses);

  return addresses;
};
