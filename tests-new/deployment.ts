import { ethers } from 'ethers';
import { mergeDeepRight } from 'ramda';
import {
  AddressLike,
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

export async function deployPrimitives(
  signer: ethers.Signer,
  tokens: { [symbol: string]: number },
) {
  const symbols = Object.keys(tokens);
  const deployed = await Promise.all(
    symbols.map((symbol) => {
      const name = `${symbol} Token`;
      const decimals = tokens[symbol];
      return contracts.PreminedToken.deploy(signer, name, symbol, decimals);
    }),
  );

  return symbols.reduce((carry, symbol, index) => {
    return { ...carry, [symbol]: deployed[index] };
  }, {} as { [symbol: string]: contracts.PreminedToken });
}

export type ContractConstructor<TContract extends Contract> = (
  signer: ethers.Signer,
  config: DeploymentConfig,
  deployment: PendingDeployment,
) => Promise<TContract>;

export interface DeploymentConfig {
  primitives: {
    [key: string]: AddressLike;
  };
  registry: {
    mgmAddress: AddressLike;
    mtcAddress: AddressLike;
    mlnToken: AddressLike;
    nativeAsset: AddressLike;
  };
  engine: {
    thawingDelay: ethers.BigNumberish;
  };
  pricefeed: {
    quoteAsset: AddressLike;
    maxPriceDeviation: ethers.BigNumberish;
    maxSpread: ethers.BigNumberish;
  };
  exchanges: {
    kyber: AddressLike;
    airswap: AddressLike;
    oasisdex: AddressLike;
    uniswap: AddressLike;
    uniswapv2: AddressLike;
    zeroexv2: AddressLike;
    zeroexv3: AddressLike;
  };
  constructors?: Partial<ContractConstructors>;
}

export type ResolvePromise<T> = T extends Promise<infer R> ? R : T;
export type PendingDeployment = {
  [TKey in keyof ContractConstructors]: ReturnType<ContractConstructors[TKey]>;
};

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

export type Deployment = {
  [TKey in keyof PendingDeployment]: ResolvePromise<PendingDeployment[TKey]>;
};

export interface ContractConstructors {
  Registry: ContractConstructor<contracts.Registry>;
  Engine: ContractConstructor<contracts.Engine>;
  KyberPriceFeed: ContractConstructor<contracts.KyberPriceFeed>;
  ValueInterpreter: ContractConstructor<contracts.ValueInterpreter>;
  SharesRequestor: ContractConstructor<contracts.SharesRequestor>;
  FundFactory: ContractConstructor<contracts.FundFactory>;
  FeeManagerFactory: ContractConstructor<contracts.FeeManagerFactory>;
  PolicyManagerFactory: ContractConstructor<contracts.PolicyManagerFactory>;
  SharesFactory: ContractConstructor<contracts.SharesFactory>;
  VaultFactory: ContractConstructor<contracts.VaultFactory>;
  ManagementFee: ContractConstructor<contracts.ManagementFee>;
  PerformanceFee: ContractConstructor<contracts.PerformanceFee>;
  AssetBlacklist: ContractConstructor<contracts.AssetBlacklist>;
  AssetWhitelist: ContractConstructor<contracts.AssetWhitelist>;
  MaxConcentration: ContractConstructor<contracts.MaxConcentration>;
  MaxPositions: ContractConstructor<contracts.MaxPositions>;
  PriceTolerance: ContractConstructor<contracts.PriceTolerance>;
  UserWhitelist: ContractConstructor<contracts.UserWhitelist>;
  KyberAdapter: ContractConstructor<contracts.KyberAdapter>;
  OasisDexAdapter: ContractConstructor<contracts.OasisDexAdapter>;
  UniswapAdapter: ContractConstructor<contracts.UniswapAdapter>;
  UniswapV2Adapter: ContractConstructor<contracts.UniswapV2Adapter>;
  ZeroExV2Adapter: ContractConstructor<contracts.ZeroExV2Adapter>;
  ZeroExV3Adapter: ContractConstructor<contracts.ZeroExV3Adapter>;
  AirSwapAdapter: ContractConstructor<contracts.AirSwapAdapter>;
  EngineAdapter: ContractConstructor<contracts.EngineAdapter>;
}

const constructors: ContractConstructors = {
  Registry: (signer, config) => {
    return contracts.Registry.deploy(
      signer,
      config.registry.mtcAddress,
      config.registry.mgmAddress,
    );
  },
  Engine: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.Engine.deploy(
      signer,
      config.engine.thawingDelay,
      Registry,
    );
  },
  KyberPriceFeed: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.KyberPriceFeed.deploy(
      signer,
      Registry,
      config.exchanges.kyber,
      config.pricefeed.maxSpread,
      config.pricefeed.quoteAsset,
      config.pricefeed.maxPriceDeviation,
    );
  },
  ValueInterpreter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.ValueInterpreter.deploy(signer, Registry);
  },
  SharesRequestor: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.SharesRequestor.deploy(signer, Registry);
  },
  FundFactory: async (signer, config, deployment) => {
    const [
      FeeManagerFactory,
      SharesFactory,
      VaultFactory,
      MaxPositions,
      Registry,
    ] = await Promise.all([
      deployment.FeeManagerFactory,
      deployment.SharesFactory,
      deployment.VaultFactory,
      deployment.MaxPositions,
      deployment.Registry,
    ]);

    return contracts.FundFactory.deploy(
      signer,
      FeeManagerFactory,
      SharesFactory,
      VaultFactory,
      MaxPositions,
      Registry,
    );
  },
  FeeManagerFactory: (signer) => {
    return contracts.FeeManagerFactory.deploy(signer);
  },
  PolicyManagerFactory: (signer) => {
    return contracts.PolicyManagerFactory.deploy(signer);
  },
  SharesFactory: (signer) => {
    return contracts.SharesFactory.deploy(signer);
  },
  VaultFactory: (signer) => {
    return contracts.VaultFactory.deploy(signer);
  },
  ManagementFee: (signer) => {
    return contracts.ManagementFee.deploy(signer);
  },
  PerformanceFee: (signer) => {
    return contracts.PerformanceFee.deploy(signer);
  },
  AssetBlacklist: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.AssetBlacklist.deploy(signer, Registry);
  },
  AssetWhitelist: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.AssetWhitelist.deploy(signer, Registry);
  },
  MaxConcentration: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.MaxConcentration.deploy(signer, Registry);
  },
  MaxPositions: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.MaxPositions.deploy(signer, Registry);
  },
  PriceTolerance: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.PriceTolerance.deploy(signer, Registry);
  },
  UserWhitelist: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    return contracts.UserWhitelist.deploy(signer, Registry);
  },
  KyberAdapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.kyber;
    return contracts.KyberAdapter.deploy(signer, Registry, Exchange);
  },
  OasisDexAdapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.oasisdex;
    return contracts.OasisDexAdapter.deploy(signer, Registry, Exchange);
  },
  UniswapAdapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.uniswap;
    return contracts.UniswapAdapter.deploy(signer, Registry, Exchange);
  },
  UniswapV2Adapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.uniswapv2;
    return contracts.UniswapV2Adapter.deploy(signer, Registry, Exchange);
  },
  ZeroExV2Adapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.zeroexv2;
    return contracts.ZeroExV2Adapter.deploy(signer, Registry, Exchange);
  },
  ZeroExV3Adapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.zeroexv3;
    return contracts.ZeroExV3Adapter.deploy(signer, Registry, Exchange);
  },
  AirSwapAdapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = config.exchanges.airswap;
    return contracts.AirSwapAdapter.deploy(signer, Registry, Exchange);
  },
  EngineAdapter: async (signer, config, deployment) => {
    const Registry = await deployment.Registry;
    const Exchange = await deployment.Engine;
    return contracts.EngineAdapter.deploy(signer, Registry, Exchange);
  },
};

export function createDeployment(
  signer: ethers.Signer,
  config: DeploymentConfig,
) {
  function deploy<TKey extends keyof ContractConstructors>(
    name: TKey,
    deployment: PendingDeployment,
  ): ReturnType<ContractConstructors[TKey]> {
    const ctor = config.constructors?.[name] ?? constructors[name];
    return ctor(signer, config, deployment) as ReturnType<
      ContractConstructors[TKey]
    >;
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

export async function deploySystem(
  signer: ethers.Signer,
  config: DeploymentConfig,
) {
  const pending = createDeployment(signer, config);
  const deployment = await resolveDeployment(pending);

  await Promise.all([
    // Misc
    deployment.Registry.setMlnToken(config.registry.mlnToken),
    deployment.Registry.setNativeAsset(config.registry.nativeAsset),
    deployment.Registry.setEngine(deployment.Engine),
    deployment.Registry.setFundFactory(deployment.FundFactory),
    deployment.Registry.setSharesRequestor(deployment.SharesRequestor),
    deployment.Registry.setValueInterpreter(deployment.ValueInterpreter),
    deployment.Registry.setPriceSource(deployment.KyberPriceFeed),

    // Fees
    deployment.Registry.registerFee(deployment.ManagementFee),
    deployment.Registry.registerFee(deployment.PerformanceFee),

    // Policies
    deployment.Registry.registerPolicy(deployment.AssetBlacklist),
    deployment.Registry.registerPolicy(deployment.AssetWhitelist),
    deployment.Registry.registerPolicy(deployment.MaxConcentration),
    deployment.Registry.registerPolicy(deployment.MaxPositions),
    deployment.Registry.registerPolicy(deployment.PriceTolerance),
    deployment.Registry.registerPolicy(deployment.UserWhitelist),

    // Adapters
    deployment.Registry.registerIntegrationAdapter(deployment.KyberAdapter),
    deployment.Registry.registerIntegrationAdapter(deployment.OasisDexAdapter),
    deployment.Registry.registerIntegrationAdapter(deployment.UniswapAdapter),
    deployment.Registry.registerIntegrationAdapter(deployment.UniswapV2Adapter),
    deployment.Registry.registerIntegrationAdapter(deployment.ZeroExV2Adapter),
    deployment.Registry.registerIntegrationAdapter(deployment.ZeroExV3Adapter),
    deployment.Registry.registerIntegrationAdapter(deployment.AirSwapAdapter),
    deployment.Registry.registerIntegrationAdapter(deployment.EngineAdapter),
  ]);

  const primitives = Object.values(config.primitives);
  await Promise.all(
    primitives.map((primitive) => {
      return deployment.Registry.registerPrimitive(primitive);
    }),
  );

  return deployment;
}

const defaults: RecursivePartial<DeploymentConfig> = {
  primitives: {},
  engine: {
    thawingDelay: 2592000,
  },
  registry: {
    mgmAddress: randomAddress(),
    mtcAddress: randomAddress(),
    nativeAsset: randomAddress(),
  },
  exchanges: {
    kyber: randomAddress(),
    oasisdex: randomAddress(),
    airswap: randomAddress(),
    uniswap: randomAddress(),
    uniswapv2: randomAddress(),
    zeroexv2: randomAddress(),
    zeroexv3: randomAddress(),
  },
  pricefeed: {
    maxPriceDeviation: ethers.utils.parseEther('0.1'),
    maxSpread: ethers.utils.parseEther('0.1'),
    quoteAsset: randomAddress(),
  },
};

export interface TestDeployment {
  system: Deployment;
  config: DeploymentConfig;
}

export function configureTestDeployment(
  overrides: Partial<DeploymentConfig> = {},
) {
  return async (provider: BuidlerProvider): Promise<TestDeployment> => {
    const signer = provider.getSigner(0);
    const config = mergeDeepRight(defaults, overrides) as DeploymentConfig;

    if (!Object.keys(config.primitives).length) {
      config.primitives = await deployPrimitives(signer, {
        MLN: 18,
        DAI: 18,
        REP: 18,
        KNC: 18,
        ZRX: 18,
      });
    }

    if (!config.registry.mlnToken) {
      config.registry.mlnToken = config.primitives.MLN;
    }

    if (!config.registry.mlnToken) {
      throw new Error('Missing configuration for "registry.mlnToken"');
    }

    const system = await deploySystem(signer, config);

    return {
      system,
      config,
    };
  };
}
