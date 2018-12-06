import { Exchanges } from '~/Contracts';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deploy as deployPriceFeed } from '~/contracts/prices/transactions/deploy';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deploy as deployEngine } from '~/contracts/engine/transactions/deploy';
import { setVersion } from '~/contracts/engine/transactions/setVersion';
import { deploy as deployPriceTolerance } from '~/contracts/fund/policies/risk-management/transactions/deploy';
import { deployRegistry } from '~/contracts/version/transactions/deployRegistry';
import { registerAsset } from '~/contracts/version/transactions/registerAsset';
import { registerExchange } from '~/contracts/version/transactions/registerExchange';
import { deployVersion } from '~/contracts/version/transactions/deployVersion';
import { deployFundRanking } from '~/contracts/factory/transactions/deployFundRanking';
import { deployWhitelist } from '~/contracts/fund/policies/compliance/transactions/deployWhitelist';
import { deployAccountingFactory } from '~/contracts/fund/accounting/transactions/deployAccountingFactory';
import { deployFeeManagerFactory } from '~/contracts/fund/fees/transactions/deployFeeManagerFactory';
import { deployParticipationFactory } from '~/contracts/fund/participation/transactions/deployParticipationFactory';
import { deploySharesFactory } from '~/contracts/fund/shares/transactions/deploySharesFactory';
import { deployTradingFactory } from '~/contracts/fund/trading/transactions/deployTradingFactory';
import { deployVaultFactory } from '~/contracts/fund/vault/transactions/deployVaultFactory';
import { deployPolicyManagerFactory } from '~/contracts/fund/policies/transactions/deployPolicyManagerFactory';
import { setSessionDeployment } from './sessionDeployments';
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { deploy0xAdapter } from '~/contracts/exchanges/transactions/deploy0xAdapter';
import { deploy0xExchange } from '~/contracts/exchanges/transactions/deploy0xExchange';
import { LogLevels } from './environment/Environment';

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async (environment = getGlobalEnvironment()) => {
  const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);

  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0]);
  const mlnTokenAddress = await deployToken('MLN');
  const quoteToken = await getToken(await deployToken('WETH'));
  const baseToken = await getToken(mlnTokenAddress);
  const wethToken = quoteToken;
  const mlnToken = baseToken;
  const eurToken = await getToken(await deployToken('EUR'));
  const zrxToken = await getToken(await deployToken('ZRX'));
  const assets = [wethToken, mlnToken, eurToken, zrxToken];
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

  const zeroExAddress = await deploy0xExchange({ zrxToken });
  const zeroExAdapterAddress = await deploy0xAdapter();

  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });

  const priceToleranceAddress = await deployPriceTolerance(10);
  const whitelistAddress = await deployWhitelist([accounts[0]]);
  const matchingMarketAdapterAddress = await deployMatchingMarketAdapter();
  const accountingFactoryAddress = await deployAccountingFactory();
  const feeManagerFactoryAddress = await deployFeeManagerFactory();
  const participationFactoryAddress = await deployParticipationFactory();
  const sharesFactoryAddress = await deploySharesFactory();
  const tradingFactoryAddress = await deployTradingFactory();
  const vaultFactoryAddress = await deployVaultFactory();
  const policyManagerFactoryAddress = await deployPolicyManagerFactory();
  const monthInSeconds = 30 * 24 * 60 * 60;
  const governanceAddress = accounts[0];
  const engineAddress = await deployEngine(
    priceFeedAddress,
    monthInSeconds,
    mlnTokenAddress,
  );
  const registryAddress = await deployRegistry();
  const versionAddress = await deployVersion({
    accountingFactoryAddress,
    engineAddress,
    factoryPriceSourceAddress: priceFeedAddress,
    feeManagerFactoryAddress,
    governanceAddress,
    mlnTokenAddress,
    participationFactoryAddress,
    policyManagerFactoryAddress,
    registryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
  });
  await setVersion(engineAddress, { versionAddress });

  const rankingAddress = await deployFundRanking();
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
  ];

  for (const exchangeConfig of exchangeConfigs) {
    await registerExchange(registryAddress, {
      adapter: exchangeConfig.adapterAddress,
      exchange: exchangeConfig.exchangeAddress,
      sigs: [],
      takesCustody: exchangeConfig.takesCustody,
    });
  }

  for (const asset of assets) {
    await registerAsset(registryAddress, {
      assetAddress: `${asset.address}`,
      assetSymbol: asset.symbol,
      breakInBreakOut: [emptyAddress, emptyAddress],
      decimals: asset.decimals,
      ipfsHash: '',
      name: '',
      sigs: [],
      standards: [],
      url: '',
    });
  }

  const priceSource = priceFeedAddress;

  const addresses = {
    engine: engineAddress,
    exchangeConfigs,
    policies: {
      priceTolerance: priceToleranceAddress,
      whitelist: whitelistAddress,
    },
    priceSource,
    ranking: rankingAddress,
    tokens: [quoteToken, baseToken, eurToken, zrxToken],
    version: versionAddress,
  };

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  debug('Deployed:', deploymentId, addresses);

  setSessionDeployment(deploymentId, addresses);
  return addresses;
};
