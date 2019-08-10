import * as R from 'ramda';

import { Exchanges, Contracts } from '~/Contracts';

import { deployMatchingMarketAdapter } from '~/contracts/exchanges/transactions/deployMatchingMarketAdapter';
import { deployMatchingMarketAccessor } from '~/contracts/exchanges/transactions/deployMatchingMarketAccessor';
import { deployEngine } from '~/contracts/engine/transactions/deployEngine';
import { deploy as deployPriceTolerance } from '~/contracts/fund/policies/risk-management/transactions/deploy';
import { deployRegistry } from '~/contracts/version/transactions/deployRegistry';
import { registerAsset } from '~/contracts/version/transactions/registerAsset';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { registerExchangeAdapter } from '~/contracts/version/transactions/registerExchangeAdapter';
import { updateExchangeAdapter } from '~/contracts/version/transactions/updateExchangeAdapter';
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
import { deployEthfinexAdapter } from '~/contracts/exchanges/transactions/deployEthfinexAdapter';
import {
  Environment,
  WithDeployment,
  Tracks,
} from '../environment/Environment';
import { deployKyberAdapter } from '~/contracts/exchanges/transactions/deployKyberAdapter';
import { deployUniswapAdapter } from '~/contracts/exchanges/transactions/deployUniswapAdapter';
import { ThirdPartyContracts } from './deployThirdParty';
import { Address, createQuantity } from '@melonproject/token-math';
import { setMlnToken } from '~/contracts/version/transactions/setMlnToken';
import { setNativeAsset } from '~/contracts/version/transactions/setNativeAsset';
import { setPriceSource } from '~/contracts/version/transactions/setPriceSource';
import { setEngine } from '~/contracts/version/transactions/setEngine';
import { setMGM } from '~/contracts/version/transactions/setMGM';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { registerVersion } from '~/contracts/version/transactions/registerVersion';
import { getVersionInformation } from '~/contracts/version/calls/getVersionInformation';
import { isFeeRegistered } from '~/contracts/version/calls/isFeeRegistered';
import { registerFees } from '~/contracts/version/transactions/registerFees';
import { getRegistryInformation } from '~/contracts/version/calls/getRegistryInformation';
import { deployKyberPriceFeed } from '~/contracts/prices/transactions/deployKyberPriceFeed';
import { getLogCurried } from '../environment/getLogCurried';
import { updateKyber } from '~/contracts/prices/transactions/updateKyber';
import { deployTestingPriceFeed } from '~/contracts/prices/transactions/deployTestingPriceFeed';
import { getConvertedPrices } from '~/tests/utils/updateTestingPriceFeed';
import { getContract } from '~/utils/solidity/getContract';
import { setDecimals } from '~/contracts/prices/transactions/setDecimals';
import { deployManagementFee } from '~/contracts/fund/fees/transactions/deployManagementFee';
import { deployPerformanceFee } from '~/contracts/fund/fees/transactions/deployPerformanceFee';
import { setEthfinexWrapperRegistry } from '~/contracts/version/transactions/setEthfinexWrapperRegistry';
import { deployEngineAdapter } from '~/contracts/exchanges/transactions/deployEngineAdapter';

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
    matchingMarketAccessor: Address;
    ethfinexAdapter: Address;
    uniswapAdapter: Address;
  };
  policies: {
    priceTolerance: Address;
    userWhitelist: Address;
  };
  fees: {
    managementFee: Address;
    performanceFee: Address;
  };
  factories: Factories;
}

export interface ContractControl {
  MGM: Address;
  registryOwner: Address;
  versionOwner: Address;
}

export type MelonContractsDraft = Partial<MelonContracts>;

export const deployAllContractsConfig = JSON.parse(`{
  "priceSource": "DEPLOY",
  "adapters": {
    "ethfinexAdapter": "DEPLOY",
    "kyberAdapter": "DEPLOY",
    "matchingMarketAdapter": "DEPLOY",
    "matchingMarketAccessor": "DEPLOY",
    "zeroExAdapter": "DEPLOY",
    "engineAdapter": "DEPLOY",
    "uniswapAdapter": "DEPLOY"
  },
  "policies": {
    "priceTolerance": "DEPLOY",
    "userWhitelist": "DEPLOY"
  },
  "fees" : {
    "managementFee": "DEPLOY",
    "performanceFee": "DEPLOY"
  },
  "factories": {
    "accountingFactory": "DEPLOY",
    "feeManagerFactory": "DEPLOY",
    "participationFactory": "DEPLOY",
    "policyManagerFactory": "DEPLOY",
    "sharesFactory": "DEPLOY",
    "tradingFactory": "DEPLOY",
    "vaultFactory": "DEPLOY"
  },
  "engine": "DEPLOY",
  "registry": "DEPLOY",
  "version": "DEPLOY",
  "ranking": "DEPLOY"
}`);

export const defaultControlConfig = JSON.parse(`{
  "MGM": "",
  "registryOwner": "",
  "versionOwner": ""
}`);

const getLog = getLogCurried('melon:protocol:utils:deploySystem');

const maybeDeploy = R.curry(
  async (
    path: string[],
    deployFunction: Function,
    environmentPromise: Promise<Environment>,
  ) => {
    const environment = await environmentPromise;
    const environmentPath = ['deployment', 'melonContracts', ...path];

    const { info } = getLog(environment);

    const adoptedContract = R.path(environmentPath, environment);

    if (adoptedContract === 'DEPLOY') {
      info('Deploying', path.join('.'));
      const address = await deployFunction(environment);
      const newEnvironment = R.assocPath(environmentPath, address, environment);

      return newEnvironment;
    }

    info('Not Deploying', path.join('.'));

    return environment;
  },
);

const maybeDoSomething = R.curry(
  async (
    shouldIt: boolean,
    something: Function,
    environmentPromise: Promise<Environment>,
  ) => {
    const environment = await environmentPromise;

    if (shouldIt) await something(environment);

    return environment;
  },
);

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async (
  environmentWithoutDeployment: Environment,
  thirdPartyContracts: ThirdPartyContracts,
  adoptedContracts: MelonContractsDraft,
  control: ContractControl,
  description?: string,
): Promise<WithDeployment> => {
  // Set thirdPartyContracts already to have them available in subsequent calls
  const environment = {
    ...environmentWithoutDeployment,
    deployment: { thirdPartyContracts, melonContracts: adoptedContracts },
  };
  const log = getLog(environment);

  log.info('Deploying system from:', environment.wallet!.address);
  log.debug('Deploying system', {
    adoptedContracts,
    thirdPartyContracts,
  });

  const wethToken = thirdPartyContracts.tokens.find(t => t.symbol === 'WETH');
  const mlnToken = thirdPartyContracts.tokens.find(t => t.symbol === 'MLN');

  const monthInSeconds = 30 * 24 * 60 * 60;

  const environmentWithDeployment = await R.pipe(
    maybeDeploy(['adapters', 'ethfinexAdapter'], environment =>
      deployEthfinexAdapter(environment),
    ),
    maybeDeploy(['adapters', 'kyberAdapter'], environment =>
      deployKyberAdapter(environment),
    ),
    maybeDeploy(['adapters', 'matchingMarketAdapter'], environment =>
      deployMatchingMarketAdapter(environment),
    ),
    maybeDeploy(['adapters', 'matchingMarketAccessor'], environment =>
      deployMatchingMarketAccessor(environment),
    ),
    maybeDeploy(['adapters', 'zeroExAdapter'], environment =>
      deploy0xAdapter(environment),
    ),
    maybeDeploy(['adapters', 'engineAdapter'], environment =>
      deployEngineAdapter(environment),
    ),
    maybeDeploy(['adapters', 'uniswapAdapter'], environment =>
      deployUniswapAdapter(environment),
    ),
    maybeDeploy(['policies', 'priceTolerance'], environment =>
      deployPriceTolerance(environment, 10),
    ),
    maybeDeploy(['policies', 'userWhitelist'], environment =>
      deployUserWhitelist(environment, [environment.wallet.address]),
    ),
    maybeDeploy(['fees', 'managementFee'], environment =>
      deployManagementFee(environment),
    ),
    maybeDeploy(['fees', 'performanceFee'], environment =>
      deployPerformanceFee(environment),
    ),
    maybeDeploy(['factories', 'accountingFactory'], environment =>
      deployAccountingFactory(environment),
    ),
    maybeDeploy(['factories', 'feeManagerFactory'], environment =>
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
    maybeDeploy(['registry'], environment =>
      deployRegistry(
        environment,
        control.registryOwner || environment.wallet.address,
      ),
    ),
    maybeDeploy(['engine'], environment =>
      deployEngine(environment, {
        delay: monthInSeconds,
        registry: environment.deployment.melonContracts.registry,
      }),
    ),
    maybeDeploy(['priceSource'], environment =>
      environment.track === Tracks.KYBER_PRICE
        ? deployKyberPriceFeed(environment, {
            // tslint:disable-next-line:max-line-length
            kyberNetworkProxy:
              environment.deployment.thirdPartyContracts.exchanges.kyber
                .kyberNetworkProxy,
            maxSpread: 0.1,
            quoteToken: wethToken,
            registry: environment.deployment.melonContracts.registry,
          })
        : deployTestingPriceFeed(environment, wethToken),
    ),
    maybeDoSomething(
      adoptedContracts.priceSource === 'DEPLOY' ||
        adoptedContracts.registry === 'DEPLOY',
      async environment => {
        const { melonContracts } = environment.deployment;

        getLog(environment).info('Register priceSource');

        await setPriceSource(environment, melonContracts.registry, {
          address: melonContracts.priceSource,
        });
      },
    ),
    maybeDoSomething(
      // TODO: some of these can be conditional
      true, // ensure these steps are done at each deployment
      async environment => {
        const { melonContracts } = environment.deployment;
        const previousInfo = await getRegistryInformation(
          environment,
          melonContracts.registry,
        );
        if (
          R.pathOr(
            '',
            ['nativeAsset', 'address'],
            previousInfo,
          ).toLowerCase() !== wethToken.address.toLowerCase()
        ) {
          getLog(environment).info('Setting native token');
          await setNativeAsset(environment, melonContracts.registry, {
            address: wethToken.address,
          });
        }
        if (
          R.pathOr('', ['mlnToken', 'address'], previousInfo).toLowerCase() !==
          mlnToken.address.toLowerCase()
        ) {
          getLog(environment).info('Setting MLN token');
          await setMlnToken(environment, melonContracts.registry, {
            address: mlnToken.address,
          });
        }
        if (
          R.pathOr('', ['engine'], previousInfo).toLowerCase() !==
          melonContracts.engine.toLowerCase()
        ) {
          getLog(environment).info('Setting engine on registry');
          await setEngine(environment, melonContracts.registry, {
            address: melonContracts.engine,
          });
        }
        getLog(environment).info('Setting MGM on registry');
        await setMGM(environment, melonContracts.registry, {
          address: control.MGM || environment.wallet.address,
        });
        if (
          R.pathOr(
            '',
            ['ethfinexWrapperRegistry'],
            previousInfo,
          ).toLowerCase() !==
          thirdPartyContracts.exchanges.ethfinex.wrapperRegistryEFX.toLowerCase()
        ) {
          getLog(environment).info('Setting ethfinex wrapper registry');
          await setEthfinexWrapperRegistry(
            environment,
            melonContracts.registry,
            {
              address:
                thirdPartyContracts.exchanges.ethfinex.wrapperRegistryEFX,
            },
          );
        }
      },
    ),
    maybeDoSomething(true, async environment => {
      // TODO: make this conditional
      const { melonContracts } = environment.deployment;
      const fees: Address[] = [
        melonContracts.fees.managementFee,
        melonContracts.fees.performanceFee,
      ];
      const unregistered: Address[] = [];
      for (const fee of fees) {
        if (
          !(await isFeeRegistered(environment, melonContracts.registry, {
            fee,
          }))
        ) {
          unregistered.push(fee);
        }
      }
      if (unregistered.length > 0) {
        getLog(environment).info('Registering fees');
        await registerFees(environment, melonContracts.registry, {
          addresses: unregistered.map(e => e.toString()),
        });
      }
    }),
    maybeDeploy(['ranking'], environment => deployFundRanking(environment)),
    maybeDeploy(['version'], environment =>
      deployVersion(environment, {
        factories: environment.deployment.melonContracts.factories,
        postDeployOwner: control.versionOwner || environment.wallet.address,
        registry: environment.deployment.melonContracts.registry,
      }),
    ),
    maybeDoSomething(true, async environment => {
      // TODO: make this conditional
      await setMGM(
        environment,
        environment.deployment.melonContracts.registry,
        {
          // used for setting initial amguPrice
          address: environment.wallet.address,
        },
      );
      const amguToken = await getAmguToken(
        environment,
        environment.deployment.melonContracts.version,
      );
      await setAmguPrice(
        environment,
        environment.deployment.melonContracts.engine,
        createQuantity(amguToken, 0),
      );
      await setMGM(
        environment,
        environment.deployment.melonContracts.registry,
        {
          // used for setting initial amguPrice
          address: control.MGM || environment.wallet.address,
        },
      );
    }),
  )(new Promise(resolve => resolve(environment)));

  const { melonContracts } = environmentWithDeployment.deployment;

  const registryInformation = await getRegistryInformation(
    environmentWithDeployment,
    melonContracts.registry,
  );

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
      takesCustody: true,
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
    [Exchanges.Ethfinex]: {
      adapter: melonContracts.adapters.ethfinexAdapter,
      exchange: thirdPartyContracts.exchanges.ethfinex.exchange,
      takesCustody: true,
    },
    [Exchanges.MelonEngine]: {
      adapter: melonContracts.adapters.engineAdapter,
      exchange: melonContracts.engine,
      takesCustody: false,
    },
    [Exchanges.UniswapFactory]: {
      adapter: melonContracts.adapters.uniswapAdapter,
      exchange: thirdPartyContracts.exchanges.uniswap,
      takesCustody: false,
    },
  };

  for (const [exchangeName, exchangeConfig] of R.toPairs(exchangeConfigs)) {
    const adapter = exchangeConfig.adapter.toLowerCase();

    // HACK: Blindly just update all registered exchanges on every deploy
    // TODO: Check the individual entries (address, adapter, takesCustory, sigs)
    //       and only update if changed
    const action = registryInformation.registeredExchanges[adapter]
      ? updateExchangeAdapter
      : registerExchangeAdapter;

    // Action.name is "execute" for both
    const actionName = registryInformation.registeredExchanges[adapter]
      ? 'updateExchangeAdapter'
      : 'registerExchangeAdapter';

    const args = {
      adapter: exchangeConfig.adapter,
      exchange: exchangeConfig.exchange,
      sigs: [
        FunctionSignatures.makeOrder,
        FunctionSignatures.takeOrder,
        FunctionSignatures.cancelOrder,
        FunctionSignatures.withdrawTokens,
      ],
      takesCustody: exchangeConfig.takesCustody,
    };

    log.debug(actionName, exchangeName, args);

    await action(environment, melonContracts.registry, args);
  }

  for (const asset of thirdPartyContracts.tokens) {
    if (!registryInformation.registeredAssets[asset.address.toLowerCase()]) {
      await registerAsset(environment, melonContracts.registry, {
        assetAddress: `${asset.address}`,
        assetSymbol: asset.symbol,
        name: '',
        reserveMin: `${(asset as any).reserveMin || 0}`,
        sigs: [],
        standards: [],
        url: '',
      });

      if (environment.track !== Tracks.KYBER_PRICE) {
        await setDecimals(environment, melonContracts.priceSource, asset);
      }
    }
  }

  if (environment.track === Tracks.KYBER_PRICE) {
    await updateKyber(
      environmentWithDeployment,
      environmentWithDeployment.deployment.melonContracts.priceSource,
    );
  } else if (environment.track === Tracks.TESTING) {
    const prices = await getConvertedPrices(environmentWithDeployment, 'ETH');
    const testingPriceFeed = await getContract(
      environmentWithDeployment,
      Contracts.TestingPriceFeed,
      environmentWithDeployment.deployment.melonContracts.priceSource,
    );
    await testingPriceFeed.methods
      .update(Object.keys(prices), Object.values(prices).map(e => e.toString()))
      .send({ from: environmentWithDeployment.wallet.address, gas: 8000000 });
  }

  const track = environment.track;
  const network = await environment.eth.net.getId();
  const deploymentId = `${network}:${track}`;

  // tslint:disable:object-literal-sort-keys
  const deployment = {
    meta: {
      deployer: environment.wallet!.address,
      timestamp: new Date().toISOString(),
      track,
      version: pkg.version,
      chain: network,
      description,
    },
    melonContracts: melonContracts as MelonContracts,
    thirdPartyContracts,
    exchangeConfigs,
  };

  log.info('Deployed:', deploymentId);
  log.debug('Deployed:', deployment);

  return {
    ...environment,
    deployment,
  };
};
