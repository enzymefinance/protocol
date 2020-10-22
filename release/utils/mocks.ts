import {
  AddressLike,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { Dispatcher } from '@melonproject/persistent';
import {
  Deployment,
  DeploymentHandlers,
  describeDeployment,
  mocks,
} from '@melonproject/utils';
import { Signer, utils } from 'ethers';
import { ReleaseDeploymentConfig } from './deployment';

export interface MockDeploymentConfig {
  deployer: Signer;
  accounts?: Signer[];
}

export interface MockDeploymentOutput {
  tokens: Promise<{
    weth: mocks.WETH;
    mln: mocks.MockToken;
    rep: mocks.MockToken;
    knc: mocks.MockToken;
    zrx: mocks.MockToken;
    dai: mocks.MockToken;
    ren: mocks.MockToken;
  }>;
  kyberIntegratee: Promise<mocks.MockKyberIntegratee>;
  chaiIntegratee: Promise<mocks.MockChaiIntegratee>;
  mockGenericAdapter: Promise<mocks.MockGenericAdapter>;
  mockGenericIntegratee: Promise<mocks.MockGenericIntegratee>;
  chainlinkEthUsdAggregator: Promise<mocks.MockChainlinkPriceSource>;
  chainlinkAggregators: Promise<{
    mln: mocks.MockChainlinkPriceSource;
    rep: mocks.MockChainlinkPriceSource;
    knc: mocks.MockChainlinkPriceSource;
    zrx: mocks.MockChainlinkPriceSource;
    dai: mocks.MockChainlinkPriceSource;
    ren: mocks.MockChainlinkPriceSource;
  }>;
  chaiPriceSource: Promise<mocks.MockChaiPriceSource>;
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
      mocks.WETH.deploy(config.deployer),
      mocks.MockToken.deploy(config.deployer, 'mln', 'MLN', 18),
      mocks.MockToken.deploy(config.deployer, 'rep', 'REP', 18),
      mocks.MockToken.deploy(config.deployer, 'knc', 'KNC', 18),
      mocks.MockToken.deploy(config.deployer, 'zrx', 'ZRX', 18),
      mocks.MockToken.deploy(config.deployer, 'dai', 'DAI', 18),
      mocks.MockToken.deploy(config.deployer, 'ren', 'REN', 18),
    ]);

    return { weth, mln, rep, knc, zrx, dai, ren };
  },
  // Price feed sources
  async chaiPriceSource(config) {
    return mocks.MockChaiPriceSource.deploy(config.deployer);
  },
  async chainlinkAggregators(config) {
    const [mln, rep, knc, zrx, dai, ren] = await Promise.all([
      mocks.MockChainlinkPriceSource.deploy(config.deployer, 18),
      mocks.MockChainlinkPriceSource.deploy(config.deployer, 18),
      mocks.MockChainlinkPriceSource.deploy(config.deployer, 18),
      mocks.MockChainlinkPriceSource.deploy(config.deployer, 18),
      mocks.MockChainlinkPriceSource.deploy(config.deployer, 18),
      mocks.MockChainlinkPriceSource.deploy(config.deployer, 8),
    ]);

    return { mln, rep, knc, zrx, dai, ren };
  },
  async chainlinkEthUsdAggregator(config) {
    return mocks.MockChainlinkPriceSource.deploy(config.deployer, 8);
  },
  // Adapter integratees
  async chaiIntegratee(config, deployment) {
    const tokens = await deployment.tokens;
    return mocks.MockChaiIntegratee.deploy(config.deployer, tokens.dai);
  },
  async kyberIntegratee(config) {
    return mocks.MockKyberIntegratee.deploy(config.deployer, []);
  },
  async mockGenericAdapter(config, deployment) {
    return mocks.MockGenericAdapter.deploy(
      config.deployer,
      await deployment.mockGenericIntegratee,
    );
  },
  async mockGenericIntegratee(config) {
    return mocks.MockGenericIntegratee.deploy(config.deployer);
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
    mocks.kyberIntegratee,
    mocks.chaiIntegratee,
    mocks.mockGenericIntegratee,
  ];

  const tokens = [
    mocks.tokens.mln as mocks.MockToken,
    mocks.tokens.rep as mocks.MockToken,
    mocks.tokens.knc as mocks.MockToken,
    mocks.tokens.zrx as mocks.MockToken,
    mocks.tokens.dai as mocks.MockToken,
    mocks.tokens.ren as mocks.MockToken,
    mocks.chaiIntegratee,
  ];

  const chainlinkPrimitives = [
    mocks.tokens.mln as mocks.MockToken,
    mocks.tokens.rep as mocks.MockToken,
    mocks.tokens.knc as mocks.MockToken,
    mocks.tokens.zrx as mocks.MockToken,
    mocks.tokens.dai as mocks.MockToken,
    mocks.tokens.ren as mocks.MockToken,
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
    mgm,
    dispatcher: dispatcher.address,
    mln: mocks.tokens.mln.address,
    weth: mocks.tokens.weth.address,
    registeredVaultCalls: {
      contracts: [],
      selectors: [],
    },
    engine: {
      thawDelay: 10000000000,
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
      chai: mocks.chaiIntegratee.address,
      kyber: mocks.kyberIntegratee.address,
      makerDao: {
        dai: mocks.tokens.dai.address,
        pot: mocks.chaiPriceSource.address,
      },
      uniswapV2: {
        factory: randomAddress(), // TODO
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
  weth: mocks.WETH,
  account: Signer,
  amount = utils.parseEther('100'),
) {
  const connected = weth.connect(account);
  return connected.deposit.value(amount).send();
}

export function makeTokenRich(
  tokens: mocks.MockToken[],
  receiver: AddressLike,
  amount = utils.parseEther('100'),
) {
  const promises = tokens.map((token) => {
    return token.mintFor(receiver, amount);
  });

  return Promise.all(promises);
}
