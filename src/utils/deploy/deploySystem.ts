import * as R from 'ramda';

import { Exchanges } from '~/Contracts';

import { deployTestingPriceFeed as deployPriceFeed } from '~/contracts/prices/transactions/deployTestingPriceFeed';
import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deploy as deployEngine } from '~/contracts/engine/transactions/deploy';
import { setVersion } from '~/contracts/engine/transactions/setVersion';
import { deploy as deployPriceTolerance } from '~/contracts/fund/policies/risk-management/transactions/deploy';
import { deployRegistry } from '~/contracts/version/transactions/deployRegistry';
import { registerAsset } from '~/contracts/version/transactions/registerAsset';
import { registerExchange } from '~/contracts/version/transactions/registerExchange';
import { deployVersion } from '~/contracts/version/transactions/deployVersion';
import { deployFundRanking } from '~/contracts/factory/transactions/deployFundRanking';
import { deployUserWhitelist } from '~/contracts/fund/policies/compliance/transactions/deployUserWhitelist';
import { deployAccountingFactory } from '~/contracts/fund/accounting/transactions/deployAccountingFactory';
import { deployFeeManagerFactory } from '~/contracts/fund/fees/transactions/deployFeeManagerFactory';
import { deployParticipationFactory } from '~/contracts/fund/participation/transactions/deployParticipationFactory';
import { deploySharesFactory } from '~/contracts/fund/shares/transactions/deploySharesFactory';
import { deployTradingFactory } from '~/contracts/fund/trading/transactions/deployTradingFactory';
import { deployVaultFactory } from '~/contracts/fund/vault/transactions/deployVaultFactory';
import { deployPolicyManagerFactory } from '~/contracts/fund/policies/transactions/deployPolicyManagerFactory';
import { deploy0xAdapter } from '~/contracts/exchanges/transactions/deploy0xAdapter';
import { LogLevels, Environment, Deployment } from '../environment/Environment';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { deployKyberAdapter } from '~/contracts/exchanges/transactions/deployKyberAdapter';
import { Thirdparty } from './deployThirdparty';

interface MelonContracts {
  priceSource?: string;
  engine?: string;
  version?: string;
  ranking?: string;
  registry?: string;
  adapters?: {
    kyberAdapter?: string;
    zeroExAdapter?: string;
    matchingMarketAdapter?: string;
  };
  policies?: {
    priceTolerance?: string;
    userWhitelist?: string;
  };
  factories?: {
    accountingFactory?: string;
    feeManagerFactory?: string;
    participationFactory?: string;
    policyManagerFactory?: string;
    sharesFactory?: string;
    tradingFactory?: string;
    vaultFactory?: string;
  };
}
/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async (
  environment: Environment,
  thirdparty: Thirdparty,
  adoptedContracts: MelonContracts = {},
): Promise<Environment> => {
  const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);
  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0], { thirdparty, adoptedContracts });

  const wethToken = thirdparty.tokens.find(t => t.symbol === 'WETH');
  const mlnToken = thirdparty.tokens.find(t => t.symbol === 'MLN');

  const actualContracts: MelonContracts = {};

  actualContracts.priceSource =
    adoptedContracts.priceSource ||
    (await deployPriceFeed(environment, wethToken));

  /// Exchange Adapters
  actualContracts.adapters.kyberAdapter =
    R.path(['adapters', 'kyberAdapter'], adoptedContracts) ||
    (await deployKyberAdapter(environment));
  actualContracts.adapters.zeroExAdapter =
    R.path(['adapters', 'zeroExAdapter'], adoptedContracts) ||
    (await deploy0xAdapter(environment));
  actualContracts.adapters.matchingMarketAdapter =
    R.path(['adapters', 'matchingMarketAdapter'], adoptedContracts) ||
    (await deployMatchingMarketAdapter(environment));

  // Policies
  // TODO: Possibility to set policy params?
  actualContracts.policies.priceTolerance =
    R.path(['policies', 'priceTolerance'], adoptedContracts) ||
    (await deployPriceTolerance(environment, 10));
  actualContracts.policies.userWhitelist =
    R.path(['policies', 'userWhitelist'], adoptedContracts) ||
    (await deployUserWhitelist(environment, [accounts[0]]));

  // Factories
  actualContracts.factories.accountingFactory =
    R.path(['factories', 'accountingFactory'], adoptedContracts) ||
    (await deployAccountingFactory(environment));
  actualContracts.factories.feeManagerFactory =
    R.path(['factories', 'feeManagerFactory'], adoptedContracts) ||
    (await deployFeeManagerFactory(environment));
  actualContracts.factories.participationFactory =
    R.path(['factories', 'participationFactory'], adoptedContracts) ||
    (await deployParticipationFactory(environment));
  actualContracts.factories.sharesFactory =
    R.path(['factories', 'sharesFactory'], adoptedContracts) ||
    (await deploySharesFactory(environment));
  actualContracts.factories.tradingFactory =
    R.path(['factories', 'tradingFactory'], adoptedContracts) ||
    (await deployTradingFactory(environment));
  actualContracts.factories.vaultFactory =
    R.path(['factories', 'vaultFactory'], adoptedContracts) ||
    (await deployVaultFactory(environment));
  actualContracts.factories.policyManagerFactory =
    R.path(['factories', 'policyManagerFactory'], adoptedContracts) ||
    (await deployPolicyManagerFactory(environment));

  const monthInSeconds = 30 * 24 * 60 * 60;
  // Not used since deployer is assumed to be governance
  // const governanceAddress = accounts[0];

  actualContracts.engine =
    adoptedContracts.engine ||
    (await deployEngine(
      environment,
      actualContracts.priceSource,
      monthInSeconds,
      mlnToken.address,
    ));

  actualContracts.registry =
    adoptedContracts.registry || (await deployRegistry(environment));

  actualContracts.version =
    adoptedContracts.registry ||
    (await deployVersion(environment, {
      factories: actualContracts.factories,
      engine: actualContracts.engine,
      priceSource: actualContracts.priceSource,
      mlnToken,
      registry: actualContracts.registry,
    }));

  await setVersion(environment, engineAddress, {
    version: actualContracts.version,
  });

  actualContracts.ranking =
    adoptedContracts.ranking || (await deployFundRanking(environment));

  const exchangeConfigs = {
    [Exchanges.MatchingMarket]: {
      adapter: actualContracts.adapters.matchingMarketAdapter,
      exchange: thirdparty.exchanges.matchingMarket,
      takesCustody: false,
    },
    [Exchanges.KyberNetwork]: {
      adapter: actualContracts.adapters.kyberAdapter,
      exchange: thirdparty.exchanges.kyber.kyberNetworkProxy,
      takesCustody: false,
    },
    [Exchanges.ZeroEx]: {
      adapter: actualContracts.adapters.zeroExAdapter,
      exchange: thirdparty.exchanges.zeroEx,
      takesCustody: false,
    },
  };

  for (const exchangeConfig of Object.values(exchangeConfigs)) {
    await registerExchange(environment, actualContracts.registry, {
      adapter: exchangeConfig.adapter,
      exchange: exchangeConfig.exchange,
      sigs: [],
      takesCustody: exchangeConfig.takesCustody,
    });
  }

  for (const asset of thirdparty.tokens) {
    await registerAsset(environment, actualContracts.registry, {
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

  const addresses = {
    ...actualContracts,
    exchangeConfigs,
    tokens: thirdparty.tokens,
  };

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  debug('Deployed:', deploymentId, addresses);

  return {
    ...environment,
    deployment: addresses,
  };
};
