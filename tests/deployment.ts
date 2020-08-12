import { BigNumberish, Signer, utils, providers } from 'ethers';
import {
  Contract,
  randomAddress,
  ContractReceipt,
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
  deployer: Signer;
  primitives: string[];
  derivatives: {
    [derivative: string]: string;
  };
  owners: {
    mgm: string;
    mtc: string;
    priceSourceUpdater: string;
  };
  registry: {
    mlnToken: string;
    wethToken: string;
  };
  engine: {
    thawingDelay: BigNumberish;
  };
  pricefeeds: {
    kyber: {
      kyberNetworkProxy: string;
      expectedRateWethQty: BigNumberish;
      quoteAsset: string;
      maxPriceDeviation: BigNumberish;
      maxSpread: BigNumberish;
      updater: string;
    };
    chai: {
      dsrPot: string;
      daiToken: string;
      chaiToken: string;
    };
  };
  adapters: {
    chai: {
      daiToken: string;
      chaiToken: string;
    };
  };
  integratees: {
    chai: string;
    kyber: string;
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
  chaiPriceFeed: ContractConstructor<contracts.ChaiPriceFeed>;
  valueInterpreter: ContractConstructor<contracts.ValueInterpreter>;
  sharesRequestor: ContractConstructor<contracts.SharesRequestor>;
  fundFactory: ContractConstructor<contracts.FundFactory>;
  feeManagerFactory: ContractConstructor<contracts.FeeManagerFactory>;
  policyManagerFactory: ContractConstructor<contracts.PolicyManagerFactory>;
  sharesFactory: ContractConstructor<contracts.SharesFactory>;
  vaultFactory: ContractConstructor<contracts.VaultFactory>;
  managementFee: ContractConstructor<contracts.ManagementFee>;
  performanceFee: ContractConstructor<contracts.PerformanceFee>;
  adapterBlacklist: ContractConstructor<contracts.AdapterBlacklist>;
  adapterWhitelist: ContractConstructor<contracts.AdapterWhitelist>;
  assetBlacklist: ContractConstructor<contracts.AssetBlacklist>;
  assetWhitelist: ContractConstructor<contracts.AssetWhitelist>;
  maxConcentration: ContractConstructor<contracts.MaxConcentration>;
  maxPositions: ContractConstructor<contracts.MaxPositions>;
  priceTolerance: ContractConstructor<contracts.PriceTolerance>;
  userWhitelist: ContractConstructor<contracts.UserWhitelist>;
  chaiAdapter: ContractConstructor<contracts.ChaiAdapter>;
  kyberAdapter: ContractConstructor<contracts.KyberAdapter>;
  uniswapV2Adapter: ContractConstructor<contracts.UniswapV2Adapter>;
  zeroExV2Adapter: ContractConstructor<contracts.ZeroExV2Adapter>;
  zeroExV3Adapter: ContractConstructor<contracts.ZeroExV3Adapter>;
  engineAdapter: ContractConstructor<contracts.EngineAdapter>;
}

const constructors: ContractConstructors = {
  registry: (config) => {
    return contracts.Registry.deploy(
      config.deployer,
      config.owners.mtc,
      config.owners.mgm,
      config.registry.mlnToken,
      config.registry.wethToken,
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
      config.pricefeeds.kyber.kyberNetworkProxy,
      config.pricefeeds.kyber.quoteAsset,
      config.pricefeeds.kyber.updater,
      config.pricefeeds.kyber.expectedRateWethQty,
      config.pricefeeds.kyber.maxSpread,
      config.pricefeeds.kyber.maxPriceDeviation,
    );
  },
  chaiPriceFeed: async (config) => {
    return contracts.ChaiPriceFeed.deploy(
      config.deployer,
      config.pricefeeds.chai.chaiToken,
      config.pricefeeds.chai.daiToken,
      config.pricefeeds.chai.dsrPot,
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
      PolicyManagerFactory,
      Registry,
    ] = await Promise.all([
      deployment.feeManagerFactory,
      deployment.sharesFactory,
      deployment.vaultFactory,
      deployment.policyManagerFactory,
      deployment.registry,
    ]);

    return contracts.FundFactory.deploy(
      config.deployer,
      FeeManagerFactory,
      SharesFactory,
      VaultFactory,
      PolicyManagerFactory,
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
  managementFee: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.ManagementFee.deploy(config.deployer, Registry);
  },
  performanceFee: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.PerformanceFee.deploy(config.deployer, Registry);
  },
  adapterBlacklist: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.AdapterBlacklist.deploy(config.deployer, Registry);
  },
  adapterWhitelist: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.AdapterWhitelist.deploy(config.deployer, Registry);
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
  chaiAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    return contracts.ChaiAdapter.deploy(
      config.deployer,
      Registry,
      config.adapters.chai.chaiToken,
      config.adapters.chai.daiToken,
    );
  },
  kyberAdapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.integratees.kyber;
    return contracts.KyberAdapter.deploy(config.deployer, Registry, Exchange);
  },
  uniswapV2Adapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.integratees.uniswapv2;
    return contracts.UniswapV2Adapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
  },
  zeroExV2Adapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.integratees.zeroexv2;
    return contracts.ZeroExV2Adapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
  },
  zeroExV3Adapter: async (config, deployment) => {
    const Registry = await deployment.registry;
    const Exchange = config.integratees.zeroexv3;
    return contracts.ZeroExV3Adapter.deploy(
      config.deployer,
      Registry,
      Exchange,
    );
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
    deployment.registry.setEngine(deployment.engine),
    deployment.registry.setFundFactory(deployment.fundFactory),
    deployment.registry.setSharesRequestor(deployment.sharesRequestor),
    deployment.registry.setValueInterpreter(deployment.valueInterpreter),
    deployment.registry.setPriceSource(deployment.kyberPriceFeed),

    // Fees
    deployment.registry.registerFee(deployment.managementFee),
    deployment.registry.registerFee(deployment.performanceFee),

    // Policies
    deployment.registry.registerPolicy(deployment.adapterBlacklist),
    deployment.registry.registerPolicy(deployment.adapterWhitelist),
    deployment.registry.registerPolicy(deployment.assetBlacklist),
    deployment.registry.registerPolicy(deployment.assetWhitelist),
    deployment.registry.registerPolicy(deployment.maxConcentration),
    deployment.registry.registerPolicy(deployment.maxPositions),
    deployment.registry.registerPolicy(deployment.priceTolerance),
    deployment.registry.registerPolicy(deployment.userWhitelist),

    // Adapters
    deployment.registry.registerIntegrationAdapter(deployment.chaiAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.kyberAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.uniswapV2Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.zeroExV2Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.zeroExV3Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.engineAdapter),
  ]);

  await Promise.all(
    config.primitives.map((primitive) => {
      return deployment.registry.registerPrimitive(primitive);
    }),
  );

  const derivatives = Object.keys(config.derivatives);
  await Promise.all(
    derivatives.map((derivative) => {
      const source = config.derivatives[derivative];
      return deployment.registry.registerDerivativePriceSource(
        derivative,
        source,
      );
    }),
  );

  return deployment;
}

export async function defaultTestConfig(
  provider: providers.JsonRpcProvider,
): Promise<TestDeploymentConfig> {
  const accounts = await provider.listAccounts();
  const [
    deployerAddress,
    mtcAddress,
    mgmAddress,
    priceSourceUpdaterAddress,
    ...remainingAccounts
  ] = accounts;

  const deployer = provider.getSigner(deployerAddress);

  const weth = await contracts.WETH.deploy(deployer);
  const [mln, rep, knc, zrx, dai] = await Promise.all([
    contracts.MockToken.deploy(deployer, 'mln', 'MLN', 18),
    contracts.MockToken.deploy(deployer, 'rep', 'REP', 18),
    contracts.MockToken.deploy(deployer, 'knc', 'KNC', 18),
    contracts.MockToken.deploy(deployer, 'zrx', 'ZRX', 18),
    contracts.MockToken.deploy(deployer, 'dai', 'DAI', 18),
  ]);

  // Deploy mock contracts for our integrations.
  const [kyberIntegratee, chaiIntegratee] = await Promise.all([
    contracts.MockKyberIntegratee.deploy(deployer, []),
    contracts.MockChaiIntegratee.deploy(deployer, dai),
  ]);

  const exchanges = [kyberIntegratee, chaiIntegratee];
  const primitives = [mln, rep, knc, zrx, dai, weth];

  // Deploy mock contracts for our price sources.
  const [kyberPriceSource, chaiPriceFeed] = await Promise.all([
    contracts.MockKyberPriceSource.deploy(deployer, primitives, weth),
    contracts.MockChaiPriceSource.deploy(deployer),
  ]);

  const derivatives = {
    [chaiIntegratee.address]: chaiPriceFeed.address,
  };

  // Make all accounts and exchanges rich so we can test investing & trading.
  await Promise.all<ContractReceipt<any>>([
    // Mint each token for each account and exchange.
    ...[...exchanges, ...accounts].flatMap((receiver) => [
      mln.mintFor(receiver, utils.parseEther('10000')),
      rep.mintFor(receiver, utils.parseEther('10000')),
      knc.mintFor(receiver, utils.parseEther('10000')),
      zrx.mintFor(receiver, utils.parseEther('10000')),
      dai.mintFor(receiver, utils.parseEther('10000')),
      chaiIntegratee.mintFor(receiver, utils.parseEther('10000')),
    ]),
    // Deposit eth into weth on behalf of every account.
    ...accounts.map((account) => {
      const connected = weth.connect(provider.getSigner(account));
      const amount = utils.parseEther('1000');
      return connected.deposit.value(amount).send();
    }),
  ]);

  // Send weth to each exchange.
  await exchanges.map((exchange) => {
    return weth.transfer(exchange, utils.parseEther('100'));
  });

  return {
    weth,
    tokens: { mln, rep, knc, zrx, dai, chai: chaiIntegratee },
    mocks: {
      integratees: {
        kyber: kyberIntegratee,
        chai: chaiIntegratee,
      },
      priceSources: {
        kyber: kyberPriceSource,
        chai: chaiPriceFeed,
      },
    },
    deployer,
    accounts: remainingAccounts,
    primitives: primitives.map((primitive) => primitive.address),
    derivatives,
    registry: {
      mlnToken: mln.address,
      wethToken: weth.address,
    },
    engine: {
      thawingDelay: 2592000,
    },
    owners: {
      mgm: mgmAddress,
      mtc: mtcAddress,
      priceSourceUpdater: priceSourceUpdaterAddress,
    },
    integratees: {
      // TODO: Mock all integrations.
      chai: chaiIntegratee.address,
      kyber: kyberIntegratee.address,
      uniswapv2: randomAddress(),
      zeroexv2: randomAddress(),
      zeroexv3: randomAddress(),
    },
    adapters: {
      chai: {
        daiToken: dai.address,
        chaiToken: chaiIntegratee.address,
      },
    },
    pricefeeds: {
      kyber: {
        expectedRateWethQty: utils.parseEther('1'),
        kyberNetworkProxy: kyberPriceSource.address,
        maxPriceDeviation: utils.parseEther('0.1'),
        maxSpread: utils.parseEther('0.1'),
        quoteAsset: weth.address,
        updater: priceSourceUpdaterAddress,
      },
      chai: {
        daiToken: dai.address,
        chaiToken: chaiIntegratee.address,
        dsrPot: chaiPriceFeed.address,
      },
    },
  };
}

export interface TestDeploymentConfig extends DeploymentConfig {
  accounts: string[];
  weth: contracts.WETH;
  tokens: {
    [symbol: string]: contracts.MockToken;
  };
  mocks: {
    integratees: {
      kyber: contracts.MockKyberIntegratee;
      chai: contracts.MockChaiIntegratee;
    };
    priceSources: {
      kyber: contracts.MockKyberPriceSource;
      chai: contracts.MockChaiPriceSource;
    };
  };
}

export interface TestDeployment<
  TConfig extends DeploymentConfig = TestDeploymentConfig
> {
  provider: providers.Provider;
  system: Deployment;
  config: TConfig;
}

export function configureTestDeployment<
  TConfig extends DeploymentConfig = TestDeploymentConfig
>(custom?: TConfig) {
  return async (
    provider: providers.JsonRpcProvider,
  ): Promise<TestDeployment<TConfig>> => {
    const config = ((custom ??
      (await defaultTestConfig(provider))) as any) as TConfig;
    const system = await deploySystem(config);

    const rate = utils.parseEther('1');
    const primitives = await system.registry.getRegisteredPrimitives();
    await system.kyberPriceFeed.update(
      primitives,
      primitives.map(() => rate),
    );

    return {
      provider,
      system,
      config,
    };
  };
}
