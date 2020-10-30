import {
  AddressLike,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  Dispatcher,
  MockChaiIntegratee,
  MockChainlinkPriceSource,
  MockChaiPriceSource,
  MockGenericAdapter,
  MockGenericIntegratee,
  MockUniswapV2Integratee,
  MockUniswapV2Pair,
  MockKyberIntegratee,
  MockToken,
  MockZeroExV2Integratee,
  WETH,
} from '@melonproject/protocol';
import { Signer, utils } from 'ethers';
import { Deployment, DeploymentHandlers, describeDeployment } from '../utils';
import { ReleaseDeploymentConfig } from './deployment';
import { encodeZeroExV2AssetData } from './integrations/zeroExV2';

export interface MockDeploymentConfig {
  deployer: Signer;
  accounts?: Signer[];
}

export interface MockDeploymentOutput {
  tokens: Promise<{
    weth: WETH;
    mln: MockToken;
    rep: MockToken;
    knc: MockToken;
    zrx: MockToken;
    dai: MockToken;
    ren: MockToken;
  }>;
  uniswapV2Derivatives: Promise<{
    mlnWeth: MockToken;
    kncWeth: MockToken;
  }>;
  kyberIntegratee: Promise<MockKyberIntegratee>;
  chaiIntegratee: Promise<MockChaiIntegratee>;
  uniswapV2Integratee: Promise<MockUniswapV2Integratee>;
  mockGenericAdapter: Promise<MockGenericAdapter>;
  mockGenericIntegratee: Promise<MockGenericIntegratee>;
  chainlinkEthUsdAggregator: Promise<MockChainlinkPriceSource>;
  chainlinkAggregators: Promise<{
    mln: MockChainlinkPriceSource;
    rep: MockChainlinkPriceSource;
    knc: MockChainlinkPriceSource;
    zrx: MockChainlinkPriceSource;
    dai: MockChainlinkPriceSource;
    ren: MockChainlinkPriceSource;
  }>;
  chaiPriceSource: Promise<MockChaiPriceSource>;
}

export type MockDeployment = Deployment<
  DeploymentHandlers<MockDeploymentConfig, MockDeploymentOutput>
>;

export const deployMocks = describeDeployment<
  MockDeploymentConfig,
  MockDeploymentOutput
>({
  // Assets
  async tokens(config) {
    const [weth, mln, rep, knc, zrx, dai, ren] = await Promise.all([
      WETH.deploy(config.deployer),
      MockToken.deploy(config.deployer, 'mln', 'MLN', 18),
      MockToken.deploy(config.deployer, 'rep', 'REP', 18),
      MockToken.deploy(config.deployer, 'knc', 'KNC', 18),
      MockToken.deploy(config.deployer, 'zrx', 'ZRX', 18),
      MockToken.deploy(config.deployer, 'dai', 'DAI', 18),
      MockToken.deploy(config.deployer, 'ren', 'REN', 18),
    ]);

    return { weth, mln, rep, knc, zrx, dai, ren };
  },
  async uniswapV2Derivatives(config, deployment) {
    const tokens = await deployment.tokens;
    const [mlnWeth, kncWeth] = await Promise.all([
      MockUniswapV2Pair.deploy(config.deployer, tokens.mln, tokens.weth),
      MockUniswapV2Pair.deploy(config.deployer, tokens.knc, tokens.weth),
    ]);

    return { mlnWeth, kncWeth };
  },
  // Price feed sources
  async chaiPriceSource(config) {
    return MockChaiPriceSource.deploy(config.deployer);
  },
  async chainlinkAggregators(config) {
    const [mln, rep, knc, zrx, dai, ren] = await Promise.all([
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 8),
    ]);

    return { mln, rep, knc, zrx, dai, ren };
  },
  async chainlinkEthUsdAggregator(config) {
    return MockChainlinkPriceSource.deploy(config.deployer, 8);
  },
  // Adapter integratees
  async chaiIntegratee(config, deployment) {
    const tokens = await deployment.tokens;
    return MockChaiIntegratee.deploy(config.deployer, tokens.dai);
  },
  async kyberIntegratee(config) {
    return MockKyberIntegratee.deploy(config.deployer, []);
  },
  async mockGenericAdapter(config, deployment) {
    return MockGenericAdapter.deploy(
      config.deployer,
      await deployment.mockGenericIntegratee,
    );
  },
  async mockGenericIntegratee(config) {
    return MockGenericIntegratee.deploy(config.deployer);
  },
  async uniswapV2Integratee(config, deployment) {
    const derivatives = await deployment.uniswapV2Derivatives;
    const tokens = await deployment.tokens;
    return MockUniswapV2Integratee.deploy(
      config.deployer,
      [],
      [tokens.mln, tokens.knc],
      [tokens.weth, tokens.weth],
      [derivatives.mlnWeth, derivatives.kncWeth],
    );
  },
  async zeroExV2Integratee(config, deployment) {
    const tokens = await deployment.tokens;
    const assetData = encodeZeroExV2AssetData(tokens.zrx.address);
    return MockZeroExV2Integratee.deploy(config.deployer, assetData);
  },
});

export async function configureMockRelease({
  deployer,
  mgm,
  dispatcher,
  mocks,
  accounts,
}: {
  deployer: Signer;
  mgm: AddressLike;
  dispatcher: Dispatcher;
  mocks: MockDeployment;
  accounts: Signer[];
}): Promise<ReleaseDeploymentConfig> {
  const integratees = [
    mocks.chaiIntegratee,
    mocks.kyberIntegratee,
    mocks.mockGenericIntegratee,
    mocks.uniswapV2Integratee,
  ];

  const tokens = [
    mocks.tokens.mln as MockToken,
    mocks.tokens.rep as MockToken,
    mocks.tokens.knc as MockToken,
    mocks.tokens.zrx as MockToken,
    mocks.tokens.dai as MockToken,
    mocks.tokens.ren as MockToken,
    mocks.uniswapV2Derivatives.mlnWeth as MockToken,
    mocks.uniswapV2Derivatives.kncWeth as MockToken,
    mocks.chaiIntegratee,
  ];

  const uniswapV2Derivatives = [
    mocks.uniswapV2Derivatives.mlnWeth as MockToken,
    mocks.uniswapV2Derivatives.kncWeth as MockToken,
  ];

  const chainlinkPrimitives = [
    mocks.tokens.mln as MockToken,
    mocks.tokens.rep as MockToken,
    mocks.tokens.knc as MockToken,
    mocks.tokens.zrx as MockToken,
    mocks.tokens.dai as MockToken,
    mocks.tokens.ren as MockToken,
  ];

  const chainlinkAggregators = [
    mocks.chainlinkAggregators.mln,
    mocks.chainlinkAggregators.rep,
    mocks.chainlinkAggregators.knc,
    mocks.chainlinkAggregators.zrx,
    mocks.chainlinkAggregators.dai,
    mocks.chainlinkAggregators.ren,
  ];

  const chainlinkRateAssets = [
    0, // MLN/ETH
    0, // REP/ETH
    0, // KNC/ETH
    0, // ZRX/ETH
    0, // DAI/ETH
    1, // REN/USD
  ];

  // Make all accounts rich in WETH and tokens.
  await Promise.all<any>([
    makeWethRich(mocks.tokens.weth, deployer, utils.parseEther('1000')),
    makeTokenRich(Object.values(tokens), deployer),
    ...accounts.map(async (account) => {
      await Promise.all([
        makeTokenRich(Object.values(tokens), account),
        makeWethRich(mocks.tokens.weth, account),
      ]);
    }),
  ]);

  await makeTokenRich(Object.values(uniswapV2Derivatives), deployer),
    // Make integratees rich in WETH, ETH, and tokens.
    await Promise.all(
      integratees.map(async (integratee) => {
        await Promise.all([
          mocks.tokens.weth.transfer(integratee, utils.parseEther('100')),
          makeEthRich(deployer, integratee),
          makeTokenRich(tokens, integratee),
        ]);
      }),
    );

  return {
    deployer,
    derivatives: {
      chai: mocks.chaiIntegratee.address,
      compound: {
        ccomp: randomAddress(),
        cdai: randomAddress(),
        ceth: randomAddress(),
        crep: randomAddress(),
        cusdc: randomAddress(),
        czrx: randomAddress(),
      },
      uniswapV2: {
        mlnWeth: mocks.uniswapV2Derivatives.mlnWeth,
        kncWeth: mocks.uniswapV2Derivatives.kncWeth,
      },
    },
    mgm,
    dispatcher: dispatcher.address,
    mln: mocks.tokens.mln.address,
    weth: mocks.tokens.weth.address,
    registeredVaultCalls: {
      contracts: [],
      selectors: [],
    },
    engine: {
      thawDelay: 3600, // 1 hour
    },
    chainlink: {
      ethUsdAggregator: mocks.chainlinkEthUsdAggregator,
      staleRateThreshold: 259200, // 72 hours
      aggregators: chainlinkAggregators,
      primitives: chainlinkPrimitives,
      rateAssets: chainlinkRateAssets,
    },
    integrationManager: {
      trackedAssetsLimit: 20, // TODO
    },
    integratees: {
      kyber: mocks.kyberIntegratee.address,
      makerDao: {
        dai: mocks.tokens.dai.address,
        pot: mocks.chaiPriceSource.address,
      },
      uniswapV2: {
        router: mocks.uniswapV2Integratee.address,
        factory: mocks.uniswapV2Integratee.address,
      },
      zeroExV2: {
        // TODO
        exchange: mocks.zeroExV2Integratee.address,
        erc20Proxy: randomAddress(),
      },
    },
  };
}

export async function makeEthRich(
  sender: Signer,
  receiver: AddressLike,
  amount = utils.parseEther('100'),
) {
  return sender.sendTransaction({
    to: await resolveAddress(receiver),
    value: amount,
  });
}

export async function makeWethRich(
  weth: WETH,
  account: Signer,
  amount = utils.parseEther('100'),
) {
  const connected = weth.connect(account);
  return connected.deposit.value(amount).send();
}

export function makeTokenRich(
  tokens: MockToken[],
  receiver: AddressLike,
  amount = utils.parseEther('1000000'),
) {
  const promises = tokens.map((token) => {
    return token.mintFor(receiver, amount);
  });

  return Promise.all(promises);
}
