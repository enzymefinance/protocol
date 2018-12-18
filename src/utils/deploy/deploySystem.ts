import * as R from 'ramda';

import { Exchanges } from '~/Contracts';

import { deployTestingPriceFeed as deployPriceFeed } from '~/contracts/prices/transactions/deployTestingPriceFeed';
import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deployEngine } from '~/contracts/engine/transactions/deployEngine';
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
import {
  LogLevels,
  Environment,
  WithDeployment,
} from '../environment/Environment';
import { deployKyberAdapter } from '~/contracts/exchanges/transactions/deployKyberAdapter';
import { ThirdPartyContracts } from './deployThirdParty';
import { Address } from '@melonproject/token-math/address';
import { setMlnToken } from '~/contracts/version/transactions/setMlnToken';
import { setNativeAsset } from '~/contracts/version/transactions/setNativeAsset';
import { setPriceSource } from '~/contracts/version/transactions/setPriceSource';
import { setEngine } from '~/contracts/version/transactions/setEngine';
import { registerVersion } from '~/contracts/version/transactions/registerVersion';
import { getVersionInformation } from '~/contracts/version/calls/getVersionInformation';
import { setRegistry } from '~/contracts/engine/transactions/setRegistry';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { setDecimals } from '~/contracts/prices/transactions/setDecimals';
import { getRegistryInformation } from '~/contracts/version/calls/getRegistryInformation';

const pkg = require('~/../package.json');

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
  environmentWithoutDeployment: Environment,
  thirdPartyContracts: ThirdPartyContracts,
  adoptedContracts: MelonContractsDraft = {},
): Promise<WithDeployment> => {
  // Set thirdPartyContracts already to have them available in subsequent calls
  const environment = {
    ...environmentWithoutDeployment,
    deployment: { thirdPartyContracts },
  };
  const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);
  const accounts = await environment.eth.getAccounts();

  debug('Deploying system from', accounts[0], {
    adoptedContracts,
    thirdPartyContracts,
  });

  const wethToken = thirdPartyContracts.tokens.find(t => t.symbol === 'WETH');
  const mlnToken = thirdPartyContracts.tokens.find(t => t.symbol === 'MLN');

  const contracts: MelonContractsDraft = {};

  contracts.priceSource =
    adoptedContracts.priceSource ||
    (await deployPriceFeed(environment, wethToken));

  /// Exchange Adapters
  contracts.adapters = {
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
  contracts.policies = {
    priceTolerance:
      R.path(['policies', 'priceTolerance'], adoptedContracts) ||
      (await deployPriceTolerance(environment, 10)),
    userWhitelist:
      R.path(['policies', 'userWhitelist'], adoptedContracts) ||
      (await deployUserWhitelist(environment, [accounts[0]])),
  };

  // Factories
  contracts.factories = {
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

  contracts.engine =
    adoptedContracts.engine ||
    (await deployEngine(environment, {
      delay: monthInSeconds,
    }));

  contracts.registry =
    adoptedContracts.registry || (await deployRegistry(environment));

  const registryInformation = await getRegistryInformation(
    environment,
    contracts.registry,
  );

  if (!adoptedContracts.registry) {
    await setNativeAsset(environment, contracts.registry, {
      address: thirdPartyContracts.tokens.find(t => t.symbol === 'WETH')
        .address,
    });
    await setMlnToken(environment, contracts.registry, {
      address: thirdPartyContracts.tokens.find(t => t.symbol === 'MLN').address,
    });
    await setPriceSource(environment, contracts.registry, {
      address: contracts.priceSource,
    });
    await setEngine(environment, contracts.registry, {
      address: contracts.engine,
    });
    await setRegistry(environment, contracts.engine, {
      address: contracts.registry,
    });
  }

  contracts.version =
    adoptedContracts.version ||
    (await deployVersion(environment, {
      engine: contracts.engine,
      factories: contracts.factories,
      mlnToken,
      priceSource: contracts.priceSource,
      registry: contracts.registry,
    }));

  const versionInformation = await getVersionInformation(
    environment,
    contracts.registry,
    { version: contracts.version },
  );

  if (!versionInformation) {
    await registerVersion(environment, contracts.registry, {
      address: contracts.version,
      name: pkg.version,
    });
  }

  contracts.ranking =
    adoptedContracts.ranking || (await deployFundRanking(environment));

  const exchangeConfigs = {
    [Exchanges.MatchingMarket]: {
      adapter: contracts.adapters.matchingMarketAdapter,
      exchange: thirdPartyContracts.exchanges.matchingMarket,
      takesCustody: false,
    },
    [Exchanges.KyberNetwork]: {
      adapter: contracts.adapters.kyberAdapter,
      exchange: thirdPartyContracts.exchanges.kyber.kyberNetworkProxy,
      takesCustody: false,
    },
    [Exchanges.ZeroEx]: {
      adapter: contracts.adapters.zeroExAdapter,
      exchange: thirdPartyContracts.exchanges.zeroEx,
      takesCustody: false,
    },
  };

  for (const exchangeConfig of Object.values(exchangeConfigs)) {
    const exchange = exchangeConfig.exchange.toLowerCase();

    if (!registryInformation.registeredExchanges[exchange]) {
      await registerExchange(environment, contracts.registry, {
        adapter: exchangeConfig.adapter,
        exchange: exchangeConfig.exchange,
        sigs: [
          FunctionSignatures.makeOrder,
          FunctionSignatures.takeOrder,
          FunctionSignatures.cancelOrder,
        ],
        takesCustody: exchangeConfig.takesCustody,
      });
    }
  }

  for (const asset of thirdPartyContracts.tokens) {
    if (!registryInformation.registeredAssets[asset.address.toLowerCase()]) {
      await registerAsset(environment, contracts.registry, {
        assetAddress: `${asset.address}`,
        assetSymbol: asset.symbol,
        decimals: asset.decimals,
        name: '',
        sigs: [],
        standards: [],
        url: '',
      });
      await setDecimals(environment, contracts.priceSource, asset);
    }
  }

  const addresses = {
    exchangeConfigs,
    melonContracts: contracts as MelonContracts,
    thirdPartyContracts,
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
