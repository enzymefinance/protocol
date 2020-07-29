import { ethers } from 'ethers';
import {
  BuidlerProvider,
  Contract,
  randomAddress,
} from '@crestproject/crestproject';
import * as contracts from './contracts';

export interface Token {
  name: string;
  symbol: string;
  decimals: number;
}

export type ContractConstructor<TContract extends Contract> = (
  config: DeploymentConfig,
  deployment: PendingDeployment,
) => Promise<TContract>;

export interface DeploymentConfig {
  deployer: ethers.Signer;
  primitives: string[];
  owners: {
    mgm: string;
    mtc: string;
  };
  registry: {
    mlnToken: string;
    nativeAsset: string;
  };
  engine: {
    thawingDelay: ethers.BigNumberish;
  };
  pricefeeds: {
    kyber: {
      quoteAsset: string;
      maxPriceDeviation: ethers.BigNumberish;
      maxSpread: ethers.BigNumberish;
    };
  };
  exchanges: {
    kyber: string;
    airswap: string;
    oasisdex: string;
    uniswap: string;
    uniswapv2: string;
    zeroexv2: string;
    zeroexv3: string;
  };
  constructors?: Partial<ContractConstructors>;
}

export type ResolvePromise<T> = T extends Promise<infer R> ? R : T;
export type PendingDeployment = {
  [TKey in keyof ContractConstructors]: ReturnType<ContractConstructors[TKey]>;
};

export type Deployment = {
  [TKey in keyof PendingDeployment]: ResolvePromise<PendingDeployment[TKey]>;
};

export interface ContractConstructors {
  registry: ContractConstructor<contracts.Registry>;
  engine: ContractConstructor<contracts.Engine>;
  kyberPriceFeed: ContractConstructor<contracts.KyberPriceFeed>;
  valueInterpreter: ContractConstructor<contracts.ValueInterpreter>;
  sharesRequestor: ContractConstructor<contracts.SharesRequestor>;
  fundFactory: ContractConstructor<contracts.FundFactory>;
  feeManagerFactory: ContractConstructor<contracts.FeeManagerFactory>;
  policyManagerFactory: ContractConstructor<contracts.PolicyManagerFactory>;
  sharesFactory: ContractConstructor<contracts.SharesFactory>;
  vaultFactory: ContractConstructor<contracts.VaultFactory>;
  managementFee: ContractConstructor<contracts.ManagementFee>;
  performanceFee: ContractConstructor<contracts.PerformanceFee>;
  assetBlacklist: ContractConstructor<contracts.AssetBlacklist>;
  assetWhitelist: ContractConstructor<contracts.AssetWhitelist>;
  maxConcentration: ContractConstructor<contracts.MaxConcentration>;
  maxPositions: ContractConstructor<contracts.MaxPositions>;
  priceTolerance: ContractConstructor<contracts.PriceTolerance>;
  userWhitelist: ContractConstructor<contracts.UserWhitelist>;
  kyberAdapter: ContractConstructor<contracts.KyberAdapter>;
  oasisDexAdapter: ContractConstructor<contracts.OasisDexAdapter>;
  uniswapAdapter: ContractConstructor<contracts.UniswapAdapter>;
  uniswapV2Adapter: ContractConstructor<contracts.UniswapV2Adapter>;
  zeroExV2Adapter: ContractConstructor<contracts.ZeroExV2Adapter>;
  zeroExV3Adapter: ContractConstructor<contracts.ZeroExV3Adapter>;
  airSwapAdapter: ContractConstructor<contracts.AirSwapAdapter>;
  engineAdapter: ContractConstructor<contracts.EngineAdapter>;
}

const constructors: ContractConstructors = {
  registry: (config) => {
    return contracts.Registry.deploy(
      config.deployer,
      config.owners.mtc,
      config.owners.mgm,
    );
  },
  engine: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.Engine.deploy(
      config.deployer,
      config.engine.thawingDelay,
      Registry,
    );
  },
  kyberPriceFeed: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.KyberPriceFeed.deploy(
      config.deployer,
      Registry,
      config.exchanges.kyber,
      config.pricefeeds.kyber.maxSpread,
      config.pricefeeds.kyber.quoteAsset,
      config.pricefeeds.kyber.maxPriceDeviation,
    );
  },
  valueInterpreter: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.ValueInterpreter.deploy(config.deployer, Registry);
  },
  sharesRequestor: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.SharesRequestor.deploy(config.deployer, Registry);
  },
  fundFactory: async (config, deployment) => {
    const [
      FeeManagerFactory,
      SharesFactory,
      VaultFactory,
      MaxPositions,
      Registry,
    ] = await Promise.all([
      deployment.feeManagerFactory,
      deployment.sharesFactory,
      deployment.vaultFactory,
      deployment.maxPositions,
      deployment.registry,
    ]);

    return contracts.FundFactory.deploy(
      config.deployer,
      FeeManagerFactory,
      SharesFactory,
      VaultFactory,
      MaxPositions,
      Registry,
    );
  },
  feeManagerFactory: (config) => {
    return contracts.FeeManagerFactory.deploy(config.deployer);
  },
  policyManagerFactory: (config) => {
    return contracts.PolicyManagerFactory.deploy(config.deployer);
  },
  sharesFactory: (config) => {
    return contracts.SharesFactory.deploy(config.deployer);
  },
  vaultFactory: (config) => {
    return contracts.VaultFactory.deploy(config.deployer);
  },
  managementFee: (config) => {
    return contracts.ManagementFee.deploy(config.deployer);
  },
  performanceFee: (config) => {
    return contracts.PerformanceFee.deploy(config.deployer);
  },
  assetBlacklist: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.AssetBlacklist.deploy(config.deployer, Registry);
  },
  assetWhitelist: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.AssetWhitelist.deploy(config.deployer, Registry);
  },
  maxConcentration: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.MaxConcentration.deploy(config.deployer, Registry);
  },
  maxPositions: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.MaxPositions.deploy(config.deployer, Registry);
  },
  priceTolerance: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.PriceTolerance.deploy(config.deployer, Registry);
  },
  userWhitelist: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.UserWhitelist.deploy(config.deployer, Registry);
  },
  kyberAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.kyber;
    return contracts.KyberAdapter.deploy(config.deployer, Registry, Exchange);
  },
  oasisDexAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.oasisdex;
    return contracts.OasisDexAdapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
  },
  uniswapAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.uniswap;
    return contracts.UniswapAdapter.deploy(config.deployer, Registry, Exchange);
  },
  uniswapV2Adapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.uniswapv2;
    return contracts.UniswapV2Adapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
  },
  zeroExV2Adapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.zeroexv2;
    return contracts.ZeroExV2Adapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
  },
  zeroExV3Adapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.zeroexv3;
    return contracts.ZeroExV3Adapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
  },
  airSwapAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.exchanges.airswap;
    return contracts.AirSwapAdapter.deploy(config.deployer, Registry, Exchange);
  },
  engineAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = await deployment.engine;
    return contracts.EngineAdapter.deploy(config.deployer, Registry, Exchange);
  },
};

export function createDeployment(config: DeploymentConfig) {
  function deploy<TKey extends keyof ContractConstructors>(
    name: TKey,
    deployment: PendingDeployment,
  ): ReturnType<ContractConstructors[TKey]> {
    const ctor = config.constructors?.[name] ?? constructors[name];
    return ctor(config, deployment) as ReturnType<ContractConstructors[TKey]>;
  }

  const deployment = {} as PendingDeployment;
  const proxy = new Proxy(deployment, {
    ownKeys: () => Object.keys(constructors),
    get: (target, prop, receiver) => {
      // TODO: Prevent recursive dependencies?
      if (constructors.hasOwnProperty(prop) && !Reflect.has(target, prop)) {
        const promise = deploy(prop as any, proxy);
        Reflect.set(target, prop, promise, receiver);
      }

      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy;
}

export async function resolveDeployment(pending: PendingDeployment) {
  const keys = Object.getOwnPropertyNames(pending);
  const deployed = await Promise.all(
    keys.map((contract: any) => (pending as any)[contract]),
  );

  const deployment = keys.reduce((carry, current, index) => {
    return { ...carry, [current]: deployed[index] };
  }, {} as Deployment);

  return deployment;
}

export async function deploySystem(config: DeploymentConfig) {
  const pending = createDeployment(config);
  const deployment = await resolveDeployment(pending);

  await Promise.all([
    // Misc
    deployment.registry.setMlnToken(config.registry.mlnToken),
    deployment.registry.setNativeAsset(config.registry.nativeAsset),
    deployment.registry.setEngine(deployment.engine),
    deployment.registry.setFundFactory(deployment.fundFactory),
    deployment.registry.setSharesRequestor(deployment.sharesRequestor),
    deployment.registry.setValueInterpreter(deployment.valueInterpreter),
    deployment.registry.setPriceSource(deployment.kyberPriceFeed),

    // Fees
    deployment.registry.registerFee(deployment.managementFee),
    deployment.registry.registerFee(deployment.performanceFee),

    // Policies
    deployment.registry.registerPolicy(deployment.assetBlacklist),
    deployment.registry.registerPolicy(deployment.assetWhitelist),
    deployment.registry.registerPolicy(deployment.maxConcentration),
    deployment.registry.registerPolicy(deployment.maxPositions),
    deployment.registry.registerPolicy(deployment.priceTolerance),
    deployment.registry.registerPolicy(deployment.userWhitelist),

    // Adapters
    deployment.registry.registerIntegrationAdapter(deployment.kyberAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.oasisDexAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.uniswapAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.uniswapV2Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.zeroExV2Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.zeroExV3Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.airSwapAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.engineAdapter),
  ]);

  const primitives = Object.values(config.primitives);
  await Promise.all(
    primitives.map((primitive) => {
      return deployment.registry.registerPrimitive(primitive);
    }),
  );

  return deployment;
}

async function defaultConfig(
  provider: BuidlerProvider,
): Promise<TestDeploymentConfig> {
  const [
    deployerAddress,
    mtcAddress,
    mgmAddress,
    ...accounts
  ] = await provider.listAccounts();

  const deployer = provider.getSigner(deployerAddress);

  const weth = await contracts.WETH.deploy(deployer);
  const [mln, dai, rep, knc, zrx] = await Promise.all([
    contracts.PreminedToken.deploy(deployer, 'MLN Token', 'MLN', 18),
    contracts.PreminedToken.deploy(deployer, 'DAI Token', 'DAI', 18),
    contracts.PreminedToken.deploy(deployer, 'REP Token', 'REP', 18),
    contracts.PreminedToken.deploy(deployer, 'KNC Token', 'KNC', 18),
    contracts.PreminedToken.deploy(deployer, 'ZRX Token', 'ZRX', 18),
  ]);

  const primitives = [
    mln.address,
    dai.address,
    rep.address,
    knc.address,
    zrx.address,
    weth.address,
  ];

  return {
    tokens: { weth, mln, dai, rep, knc, zrx } as any,
    deployer,
    accounts,
    primitives,
    engine: {
      thawingDelay: 2592000,
    },
    owners: {
      mgm: mgmAddress,
      mtc: mtcAddress,
    },
    registry: {
      nativeAsset: weth.address,
      mlnToken: mln.address,
    },
    // TODO: Mock exchanges by
    exchanges: {
      kyber: randomAddress(),
      oasisdex: randomAddress(),
      airswap: randomAddress(),
      uniswap: randomAddress(),
      uniswapv2: randomAddress(),
      zeroexv2: randomAddress(),
      zeroexv3: randomAddress(),
    },
    pricefeeds: {
      kyber: {
        maxPriceDeviation: ethers.utils.parseEther('0.1'),
        maxSpread: ethers.utils.parseEther('0.1'),
        quoteAsset: weth.address,
      },
    },
  };
}

export interface TestDeploymentConfig extends DeploymentConfig {
  accounts: string[];
  tokens: {
    weth: contracts.WETH;
  } & {
    [symbol: string]: undefined | contracts.PreminedToken;
  };
}

export interface TestDeployment<
  TConfig extends DeploymentConfig = TestDeploymentConfig
> {
  system: Deployment;
  config: TConfig;
}

export function configureTestDeployment<
  TConfig extends DeploymentConfig = TestDeploymentConfig
>(custom?: TConfig) {
  return async (
    provider: BuidlerProvider,
  ): Promise<TestDeployment<TConfig>> => {
    const config = ((custom ??
      (await defaultConfig(provider))) as any) as TConfig;
    const system = await deploySystem(config);

    return {
      system,
      config,
    };
  };
}
