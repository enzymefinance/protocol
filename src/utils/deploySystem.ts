import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deploy as deployPriceFeed } from '~/contracts/prices/transactions/deploy';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deploy as deployEngine } from '~/contracts/engine/transactions/deploy';
// tslint:disable-next-line:max-line-length
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
// tslint:disable-next-line:max-line-length
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';

export const sessionDeployments = {};

const debug = require('./getDebug').default(__filename);

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async () => {
  const environment = getGlobalEnvironment();
  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0]);
  const quoteTokenAddress = await deployToken('WETH');
  const mlnTokenAddress = await deployToken('MLN');
  const eurTokenAddress = await deployToken('EUR');
  const baseTokenAddress = mlnTokenAddress;
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const eurToken = await getToken(eurTokenAddress);
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
    tokens: [quoteToken, baseToken, eurToken],
    version: versionAddress,
  };

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  debug('Deployed:', deploymentId, addresses);

  sessionDeployments[deploymentId] = addresses;

  return addresses;
};
