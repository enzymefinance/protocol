import * as R from 'ramda';

import { Exchanges } from '~/Contracts';

import { deployTestingPriceFeed as deployPriceFeed } from '~/contracts/prices/transactions/deployTestingPriceFeed';
import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deployEngine } from '~/contracts/engine/transactions/deployEngine';
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
import { LogLevels, Environment } from '../environment/Environment';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { deployKyberAdapter } from '~/contracts/exchanges/transactions/deployKyberAdapter';
import { ThirdpartyContracts } from './deployThirdparty';
import { Address } from '@melonproject/token-math/address';

type Partial<T> = { [P in keyof T]?: T[P] };
export interface Factories {
  accountingFactory: Address;
  feeManagerFactory: Address;
  participationFactory: Address;
  policyManagerFactory: Address;
  sharesFactory: Address;
  tradingFactory: Address;
  vaultFactory: Address;
}

export interface MelonContracts {
  priceSource: Address;
  engine: Address;
  version: Address;
  ranking: Address;
  registry: Address;
  adapters: {
    kyberAdapter: Address;
    zeroExAdapter: Address;
    matchingMarketAdapter: Address;
  };
  policies: {
    priceTolerance: Address;
    userWhitelist: Address;
  };
  factories: Factories;
}

type MelonContractsDraft = Partial<MelonContracts>;

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async (
  environment: Environment,
  thirdpartyContracts: ThirdpartyContracts,
  adoptedContracts: MelonContractsDraft = {},
): Promise<Environment> => {
  const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);
  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0], {
    adoptedContracts,
    thirdpartyContracts,
  });

  const wethToken = thirdpartyContracts.tokens.find(t => t.symbol === 'WETH');
  const mlnToken = thirdpartyContracts.tokens.find(t => t.symbol === 'MLN');

  const actualContracts: MelonContractsDraft = {};

  actualContracts.priceSource =
    adoptedContracts.priceSource ||
    (await deployPriceFeed(environment, wethToken));

  /// Exchange Adapters
  actualContracts.adapters = {
    kyberAdapter:
      R.path(['adapters', 'kyberAdapter'], adoptedContracts) ||
      (await deployKyberAdapter(environment)),
    matchingMarketAdapter:
      R.path(['adapters', 'matchingMarketAdapter'], adoptedContracts) ||
      (await deployMatchingMarketAdapter(environment)),
    zeroExAdapter:
      R.path(['adapters', 'zeroExAdapter'], adoptedContracts) ||
      (await deploy0xAdapter(environment)),
  };

  // Policies
  // TODO: Possibility to set policy params?
  actualContracts.policies = {
    priceTolerance:
      R.path(['policies', 'priceTolerance'], adoptedContracts) ||
      (await deployPriceTolerance(environment, 10)),
    userWhitelist:
      R.path(['policies', 'userWhitelist'], adoptedContracts) ||
      (await deployUserWhitelist(environment, [accounts[0]])),
  };

  // Factories
  actualContracts.factories = {
    accountingFactory:
      R.path(['factories', 'accountingFactory'], adoptedContracts) ||
      (await deployAccountingFactory(environment)),
    feeManagerFactory:
      R.path(['factories', 'feeManagerFactory'], adoptedContracts) ||
      (await deployFeeManagerFactory(environment)),
    participationFactory:
      R.path(['factories', 'participationFactory'], adoptedContracts) ||
      (await deployParticipationFactory(environment)),
    policyManagerFactory:
      R.path(['factories', 'policyManagerFactory'], adoptedContracts) ||
      (await deployPolicyManagerFactory(environment)),
    sharesFactory:
      R.path(['factories', 'sharesFactory'], adoptedContracts) ||
      (await deploySharesFactory(environment)),
    tradingFactory:
      R.path(['factories', 'tradingFactory'], adoptedContracts) ||
      (await deployTradingFactory(environment)),
    vaultFactory:
      R.path(['factories', 'vaultFactory'], adoptedContracts) ||
      (await deployVaultFactory(environment)),
  };

  const monthInSeconds = 30 * 24 * 60 * 60;
  // Not used since deployer is assumed to be governance
  // const governanceAddress = accounts[0];

  actualContracts.engine =
    adoptedContracts.engine ||
    (await deployEngine(environment, {
      delay: monthInSeconds,
      mlnToken,
      priceSource: actualContracts.priceSource,
    }));

  actualContracts.registry =
    adoptedContracts.registry || (await deployRegistry(environment));

  actualContracts.version =
    adoptedContracts.registry ||
    (await deployVersion(environment, {
      engine: actualContracts.engine,
      factories: actualContracts.factories,
      mlnToken,
      priceSource: actualContracts.priceSource,
      registry: actualContracts.registry,
    }));

  await setVersion(environment, actualContracts.engine, {
    version: actualContracts.version,
  });

  actualContracts.ranking =
    adoptedContracts.ranking || (await deployFundRanking(environment));

  const exchangeConfigs = {
    [Exchanges.MatchingMarket]: {
      adapter: actualContracts.adapters.matchingMarketAdapter,
      exchange: thirdpartyContracts.exchanges.matchingMarket,
      takesCustody: false,
    },
    [Exchanges.KyberNetwork]: {
      adapter: actualContracts.adapters.kyberAdapter,
      exchange: thirdpartyContracts.exchanges.kyber.kyberNetworkProxy,
      takesCustody: false,
    },
    [Exchanges.ZeroEx]: {
      adapter: actualContracts.adapters.zeroExAdapter,
      exchange: thirdpartyContracts.exchanges.zeroEx,
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

  for (const asset of thirdpartyContracts.tokens) {
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
    exchangeConfigs,
    melonContracts: actualContracts as MelonContracts,
    thirdpartyContracts,
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
