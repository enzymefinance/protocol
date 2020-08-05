import { BigNumberish, providers, Signer, utils } from 'ethers';
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

export type ContractConstructor<TContract extends Contract> = (
  config: DeploymentConfig,
  deployment: PendingDeployment,
) => Promise<TContract>;

export interface DeploymentConfig {
  deployer: Signer;
  primitives: string[];
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
  };
  integratees: {
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
    deployment.registry.registerPolicy(deployment.assetBlacklist),
    deployment.registry.registerPolicy(deployment.assetWhitelist),
    deployment.registry.registerPolicy(deployment.maxConcentration),
    deployment.registry.registerPolicy(deployment.maxPositions),
    deployment.registry.registerPolicy(deployment.priceTolerance),
    deployment.registry.registerPolicy(deployment.userWhitelist),

    // Adapters
    deployment.registry.registerIntegrationAdapter(deployment.kyberAdapter),
    deployment.registry.registerIntegrationAdapter(deployment.uniswapV2Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.zeroExV2Adapter),
    deployment.registry.registerIntegrationAdapter(deployment.zeroExV3Adapter),
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

export async function defaultTestConfig(
  provider: BuidlerProvider,
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
  await Promise.all(
    accounts.map((account) => {
      const connected = weth.connect(provider.getSigner(account));
      const amount = utils.parseEther('1000');
      return connected.deposit.value(amount).send();
    }),
  );

  const premine = [
    { name: 'MLN Token', symbol: 'MLN', decimals: 18 },
    { name: 'DAI Token', symbol: 'DAI', decimals: 18 },
    { name: 'REP Token', symbol: 'REP', decimals: 18 },
    { name: 'KNC Token', symbol: 'KNC', decimals: 18 },
    { name: 'ZRX Token', symbol: 'ZRX', decimals: 18 },
  ];

  // Deploy a few premined tokens as configured.
  const premined = await Promise.all(
    premine.map((token) => {
      return contracts.PreminedToken.deploy(
        deployer,
        token.name,
        token.symbol,
        token.decimals,
      );
    }),
  );

  // Produce a map of tokens for easy access in our tests.
  const symbols = premine.map((item) => item.symbol.toLowerCase());
  const tokens: {
    [symbol: string]: contracts.WETH | contracts.PreminedToken;
  } = symbols.reduce(
    (carry, symbol, index) => ({ ...carry, [symbol]: premined[index] }),
    { weth },
  );

  // Deploy mock contracts for our integrations.
  const [kyber] = await Promise.all([
    contracts.MockKyberIntegratee.deploy(deployer, []),
  ]);

  const primitives = [...premined, weth];
  const primitiveAddresses = primitives.map((item) => item.address);
  const integratees = [kyber];

  // Deploy mock contracts for our price sources.
  const [kyberPriceSource] = await Promise.all([
    contracts.MockKyberPriceSource.deploy(deployer, primitiveAddresses),
  ]);

  // Make all accounts and integratees (exchanges) rich so we can test trading.
  const mint = premine.map((token) => {
    return utils.parseUnits('10000', token.decimals);
  });

  await Promise.all(
    accounts.map((account) => mintTokens(premined, account, mint)),
  );

  await Promise.all(
    integratees.map((integratee) => {
      return Promise.all([
        mintTokens(premined, integratee, mint),
        transferWeth(weth, integratee),
      ]);
    }),
  );

  return {
    tokens,
    mocks: {
      integratees: {
        kyber,
      },
      priceSources: {
        kyber: kyberPriceSource,
      },
    },
    deployer,
    accounts: remainingAccounts,
    primitives: primitiveAddresses,
    engine: {
      thawingDelay: 2592000,
    },
    owners: {
      mgm: mgmAddress,
      mtc: mtcAddress,
      priceSourceUpdater: priceSourceUpdaterAddress,
    },
    registry: {
      wethToken: weth.address,
      mlnToken: tokens.mln.address,
    },
    integratees: {
      // TODO: Mock all integrations.
      kyber: kyber.address,
      uniswapv2: randomAddress(),
      zeroexv2: randomAddress(),
      zeroexv3: randomAddress(),
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
    },
  };
}

export interface TestDeploymentConfig extends DeploymentConfig {
  accounts: string[];
  mocks: {
    integratees: {
      kyber: contracts.MockKyberIntegratee;
    };
    priceSources: {
      kyber: contracts.MockKyberPriceSource;
    };
  };
  tokens: {
    [symbol: string]: contracts.PreminedToken | contracts.WETH;
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
    provider: BuidlerProvider,
  ): Promise<TestDeployment<TConfig>> => {
    const config = ((custom ??
      (await defaultTestConfig(provider))) as any) as TConfig;
    const system = await deploySystem(config);

    return {
      provider,
      system,
      config,
    };
  };
}

const defaultAmount = utils.parseEther('10000');
export async function mintTokens(
  tokens: contracts.PreminedToken[],
  who: AddressLike,
  amounts: BigNumberish[] = tokens.map(() => defaultAmount),
) {
  return await Promise.all(
    tokens.map(async (token, index) => {
      const amount = amounts[index] ?? defaultAmount;
      return token.mint(who, amount);
    }),
  );
}

// TODO: Increase the initial balance on all accounts so we can send more.
// Currently, each account only gets 10000 WETH of which we deposit 5000
// into WETH. Of these we then transfer 100 to each mocked integratee.
const defaultWethAmount = utils.parseEther('100');
export async function transferWeth(
  weth: contracts.WETH,
  who: AddressLike,
  amount: BigNumberish = defaultWethAmount,
) {
  return await weth.transfer(who, amount);
}
