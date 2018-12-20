import * as R from 'ramda';

import { Exchanges } from '~/Contracts';

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
import { deployKyberPriceFeed } from '~/contracts/prices/transactions/deployKyberPriceFeed';

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

export type MelonContractsDraft = Partial<MelonContracts>;

const maybeDeploy = R.curry(
  async (
    path: string[],
    deployFunction: Function,
    environmentPromise: Promise<Environment>,
  ) => {
    const environment = await environmentPromise;
    const environmentPath = ['deployment', 'melonContracts', ...path];

    const info = environment.logger(
      'melon:protocol:utils:deploySystem',
      LogLevels.INFO,
    );

    const adoptedContract = R.path(environmentPath, environment);

    if (adoptedContract === 'DEPLOY') {
      info('Deploying', path.join('.'));
      const address = await deployFunction(environment);
      const newEnvironment = R.assocPath(environmentPath, address);
      return newEnvironment;
    }

    info('Not Deploying', path.join('.'));

    return environment;
  },
);

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
    deployment: { thirdPartyContracts, melonContracts: adoptedContracts },
  };
  const log = environment.logger('melon:protocol:utils:deploySystem');

  log(LogLevels.INFO, 'Deploying system from:', environment.wallet.address);
  log(LogLevels.DEBUG, 'Deploying system', {
    adoptedContracts,
    thirdPartyContracts,
  });

  const wethToken = thirdPartyContracts.tokens.find(t => t.symbol === 'WETH');
  const mlnToken = thirdPartyContracts.tokens.find(t => t.symbol === 'MLN');

  const monthInSeconds = 30 * 24 * 60 * 60;

  const environmentWithDeployment = await R.pipe(
    maybeDeploy(['adapters', 'kyberAdapter'], environment =>
      deployKyberAdapter(environment),
    ),
    maybeDeploy(['adapters', 'matchingMarketAdapter'], environment =>
      deployMatchingMarketAdapter(environment),
    ),
    maybeDeploy(['adapters', 'zeroExAdapter'], environment =>
      deploy0xAdapter(environment),
    ),
    maybeDeploy(['adapters', 'kyberAdapter'], environment =>
      deployKyberAdapter(environment),
    ),
    maybeDeploy(['adapters', 'kyberAdapter'], environment =>
      deployKyberAdapter(environment),
    ),
    maybeDeploy(['policies', 'priceTolerance'], environment =>
      deployPriceTolerance(environment, 10),
    ),
    maybeDeploy(['policies', 'userWhitelist'], environment =>
      deployUserWhitelist(environment, [environment.wallet.address]),
    ),
    maybeDeploy(['factories', 'accountingFactory'], environment =>
      deployAccountingFactory(environment),
    ),
    maybeDeploy(['factories', 'feeManaberFactory'], environment =>
      deployFeeManagerFactory(environment),
    ),
    maybeDeploy(['factories', 'participationFactory'], environment =>
      deployParticipationFactory(environment),
    ),
    maybeDeploy(['factories', 'policyManagerFactory'], environment =>
      deployPolicyManagerFactory(environment),
    ),
    maybeDeploy(['factories', 'sharesFactory'], environment =>
      deploySharesFactory(environment),
    ),
    maybeDeploy(['factories', 'tradingFactory'], environment =>
      deployTradingFactory(environment),
    ),
    maybeDeploy(['factories', 'vaultFactory'], environment =>
      deployVaultFactory(environment),
    ),
    maybeDeploy(['engine'], environment =>
      deployEngine(environment, { delay: monthInSeconds }),
    ),
    maybeDeploy(['registry'], environment => deployRegistry(environment)),
    maybeDeploy(['priceSource'], environment =>
      deployKyberPriceFeed(environment, {
        // tslint:disable-next-line:max-line-length
        kyberNetworkProxy:
          environment.deployment.thirdPartyContracts.exchanges.kyber
            .kyberNetworkProxy,
        quoteToken: wethToken,
        registry: environment.deployment.melonContracts.registry,
      }),
    ),
    maybeDeploy(['ranking'], environment => deployFundRanking(environment)),
  )(new Promise(resolve => resolve(environment)));

  const { melonContracts } = environmentWithDeployment;

  const registryInformation = await getRegistryInformation(
    environmentWithDeployment,
    environmentWithDeployment.melonContracts.registry,
  );

  if (!adoptedContracts.priceSource || !adoptedContracts.registry) {
    log(LogLevels.INFO, 'Register priceSource', melonContracts.priceSource);
    await setPriceSource(environmentWithDeployment, melonContracts.registry, {
      address: melonContracts.priceSource,
    });
  }

  if (!adoptedContracts.registry) {
    await setNativeAsset(environmentWithDeployment, melonContracts.registry, {
      address: wethToken.address,
    });
    await setMlnToken(environmentWithDeployment, melonContracts.registry, {
      address: mlnToken.address,
    });
    await setEngine(environmentWithDeployment, melonContracts.registry, {
      address: melonContracts.engine,
    });
    await setRegistry(environmentWithDeployment, melonContracts.engine, {
      address: melonContracts.registry,
    });
  }

  melonContracts.version =
    adoptedContracts.version ||
    (await deployVersion(environment, {
      engine: melonContracts.engine,
      factories: melonContracts.factories,
      mlnToken,
      priceSource: melonContracts.priceSource,
      registry: melonContracts.registry,
    }));

  const versionInformation = await getVersionInformation(
    environment,
    melonContracts.registry,
    { version: melonContracts.version },
  );

  if (!versionInformation) {
    await registerVersion(environment, melonContracts.registry, {
      address: melonContracts.version,
      name: pkg.version,
    });
  }

  const exchangeConfigs = {
    [Exchanges.MatchingMarket]: {
      adapter: melonContracts.adapters.matchingMarketAdapter,
      exchange: thirdPartyContracts.exchanges.matchingMarket,
      takesCustody: false,
    },
    [Exchanges.KyberNetwork]: {
      adapter: melonContracts.adapters.kyberAdapter,
      exchange: thirdPartyContracts.exchanges.kyber.kyberNetworkProxy,
      takesCustody: false,
    },
    [Exchanges.ZeroEx]: {
      adapter: melonContracts.adapters.zeroExAdapter,
      exchange: thirdPartyContracts.exchanges.zeroEx,
      takesCustody: false,
    },
  };

  for (const exchangeConfig of Object.values(exchangeConfigs)) {
    const exchange = exchangeConfig.exchange.toLowerCase();

    if (!registryInformation.registeredExchanges[exchange]) {
      await registerExchange(environment, melonContracts.registry, {
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
      await registerAsset(environment, melonContracts.registry, {
        assetAddress: `${asset.address}`,
        assetSymbol: asset.symbol,
        decimals: asset.decimals,
        name: '',
        reserveMin: '',
        sigs: [],
        standards: [],
        url: '',
      });
      await setDecimals(environment, melonContracts.priceSource, asset);
    }
  }

  const addresses = {
    exchangeConfigs,
    melonContracts: melonContracts as MelonContracts,
    thirdPartyContracts,
  };

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  log(LogLevels.INFO, 'Deployed:', deploymentId);
  log(LogLevels.DEBUG, 'Deployed:', addresses);

  return {
    ...environment,
    deployment: addresses,
  };
};
