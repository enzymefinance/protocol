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
  }>;
  kyberIntegratee: Promise<mocks.MockKyberIntegratee>;
  chaiIntegratee: Promise<mocks.MockChaiIntegratee>;
  mockGenericAdapter: Promise<mocks.MockGenericAdapter>;
  mockGenericIntegratee: Promise<mocks.MockGenericIntegratee>;
  chainlinkPriceSources: Promise<{
    weth: mocks.MockChainlinkPriceSource;
    mln: mocks.MockChainlinkPriceSource;
    rep: mocks.MockChainlinkPriceSource;
    knc: mocks.MockChainlinkPriceSource;
    zrx: mocks.MockChainlinkPriceSource;
    dai: mocks.MockChainlinkPriceSource;
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
    const [weth, mln, rep, knc, zrx, dai] = await Promise.all([
      mocks.WETH.deploy(config.deployer),
      mocks.MockToken.deploy(config.deployer, 'mln', 'MLN', 18),
      mocks.MockToken.deploy(config.deployer, 'rep', 'REP', 18),
      mocks.MockToken.deploy(config.deployer, 'knc', 'KNC', 18),
      mocks.MockToken.deploy(config.deployer, 'zrx', 'ZRX', 18),
      mocks.MockToken.deploy(config.deployer, 'dai', 'DAI', 18),
    ]);

    return { weth, mln, rep, knc, zrx, dai };
  },
  // Price feed sources
  async chaiPriceSource(config) {
    return mocks.MockChaiPriceSource.deploy(config.deployer);
  },
  async chainlinkPriceSources(config) {
    const [weth, mln, rep, knc, zrx, dai] = await Promise.all([
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
    ]);

    return { weth, mln, rep, knc, zrx, dai };
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
    mocks.tokens.dai as mocks.MockToken,
    mocks.tokens.knc as mocks.MockToken,
    mocks.tokens.mln as mocks.MockToken,
    mocks.tokens.rep as mocks.MockToken,
    mocks.tokens.zrx as mocks.MockToken,
    mocks.chaiIntegratee,
  ];
  accounts = (accounts ?? []).concat(deployer);

  // Make all accounts rich in WETH and tokens
  await Promise.all<any>([
    ...accounts.map((receiver) => {
      return makeTokenRich(Object.values(tokens), receiver);
    }),
    ...accounts.map((account) => {
      makeWethRich(mocks.tokens.weth, deployer);
      return makeWethRich(mocks.tokens.weth, account);
    }),
  ]);

  // Make integratees rich in WETH, ETH, and tokens.
  await Promise.all<any>([
    integratees.map((receiver) => {
      return Promise.all([
        mocks.tokens.weth.transfer(receiver, utils.parseEther('100')),
        makeEthRich(deployer, receiver),
        makeTokenRich(tokens, receiver),
      ]);
    }),
  ]);

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
      rateQuoteAsset: mocks.tokens.weth.address,
      aggregators: Object.values(mocks.chainlinkPriceSources).map(
        (aggregator) => aggregator.address,
      ),
      primitives: Object.keys(mocks.chainlinkPriceSources).map(
        (symbol) => (mocks.tokens as any)[symbol].address,
      ),
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

export async function makeEthRich(sender: Signer, receiver: AddressLike) {
  return sender.sendTransaction({
    to: await resolveAddress(receiver),
    value: utils.parseEther('100'),
  });
}

export async function makeWethRich(weth: mocks.WETH, account: Signer) {
  const connected = weth.connect(account);
  const amount = utils.parseEther('100');
  return connected.deposit.value(amount).send();
}

export function makeTokenRich(
  tokens: mocks.MockToken[],
  receiver: AddressLike,
) {
  const promises = tokens.map((token) => {
    return token.mintFor(receiver, utils.parseEther('100'));
  });

  return Promise.all(promises);
}
