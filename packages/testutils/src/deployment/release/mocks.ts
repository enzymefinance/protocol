import { AddressLike, randomAddress, resolveAddress, SignerWithAddress } from '@crestproject/crestproject';
import {
  Dispatcher,
  encodeZeroExV2AssetData,
  MockChaiIntegratee,
  MockChainlinkPriceSource,
  MockChaiPriceSource,
  MockCTokenIntegratee,
  MockGenericAdapter,
  MockGenericIntegratee,
  MockKyberIntegratee,
  MockToken,
  MockUniswapV2Integratee,
  MockUniswapV2Pair,
  MockZeroExV2Integratee,
  WETH,
} from '@melonproject/protocol';
import { utils } from 'ethers';
import { Deployment, DeploymentHandlers, describeDeployment } from '../deployment';
import { ReleaseDeploymentConfig } from './deployment';

export interface MockDeploymentConfig {
  deployer: SignerWithAddress;
  accounts?: SignerWithAddress[];
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
    comp: MockToken;
    usdc: MockToken;
  }>;
  uniswapV2Derivatives: Promise<{
    mlnWeth: MockToken;
    kncWeth: MockToken;
  }>;
  compoundTokens: Promise<{
    ccomp: MockToken;
    cdai: MockToken;
    ceth: MockToken;
    crep: MockToken;
    cusdc: MockToken;
    czrx: MockToken;
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

export type MockDeployment = Deployment<DeploymentHandlers<MockDeploymentConfig, MockDeploymentOutput>>;

export const deployMocks = describeDeployment<MockDeploymentConfig, MockDeploymentOutput>({
  // Assets
  async tokens(config) {
    const [weth, mln, rep, knc, zrx, dai, ren, comp, usdc] = await Promise.all([
      WETH.deploy(config.deployer),
      MockToken.deploy(config.deployer, 'Melon Token', 'MLN', 18),
      MockToken.deploy(config.deployer, 'Reputation', 'REP', 18),
      MockToken.deploy(config.deployer, 'Kyber Network Crystal', 'KNC', 18),
      MockToken.deploy(config.deployer, '0x Protocol Token', 'ZRX', 18),
      MockToken.deploy(config.deployer, 'Dai Stablecoin', 'DAI', 18),
      MockToken.deploy(config.deployer, 'Republic Token', 'REN', 18),
      MockToken.deploy(config.deployer, 'Compound', 'COMP', 18),
      MockToken.deploy(config.deployer, 'USD Coin', 'USDC', 6),
    ]);

    return { weth, mln, rep, knc, zrx, dai, ren, comp, usdc };
  },
  async compoundTokens(config, deployment) {
    const tokens = await deployment.tokens;
    const [ceth, ccomp, cdai, crep, cusdc, czrx] = await Promise.all([
      // TODO: deploy MockCEther contract
      MockToken.deploy(config.deployer, 'Compound Ether', 'cETH', 8),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Collateral', 'cCOMP', 8, tokens.comp),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Dai', 'cDAI', 8, tokens.dai),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Augur', 'cREP', 8, tokens.rep),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound USD Coin', 'cUSDC', 8, tokens.usdc),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound 0x', 'cZRX', 8, tokens.zrx),
    ]);

    return { ccomp, cdai, ceth, crep, cusdc, czrx };
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
    return MockGenericAdapter.deploy(config.deployer, await deployment.mockGenericIntegratee);
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
    const assetData = encodeZeroExV2AssetData(tokens.zrx);
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
  deployer: SignerWithAddress;
  mgm: SignerWithAddress;
  dispatcher: Dispatcher;
  mocks: MockDeployment;
  accounts: SignerWithAddress[];
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
    mocks.compoundTokens.ccomp,
    mocks.compoundTokens.cdai,
    mocks.compoundTokens.ceth,
    mocks.compoundTokens.crep,
    mocks.compoundTokens.cusdc,
    mocks.compoundTokens.czrx,
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
      await Promise.all([makeTokenRich(Object.values(tokens), account), makeWethRich(mocks.tokens.weth, account)]);
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
      chai: mocks.chaiIntegratee,
      compound: {
        ccomp: mocks.compoundTokens.ccomp,
        cdai: mocks.compoundTokens.cdai,
        ceth: mocks.compoundTokens.ceth,
        crep: mocks.compoundTokens.crep,
        cusdc: mocks.compoundTokens.cusdc,
        czrx: mocks.compoundTokens.czrx,
      },
      uniswapV2: {
        mlnWeth: mocks.uniswapV2Derivatives.mlnWeth,
        kncWeth: mocks.uniswapV2Derivatives.kncWeth,
      },
    },
    mgm,
    dispatcher: dispatcher,
    mln: mocks.tokens.mln,
    weth: mocks.tokens.weth,
    registeredVaultCalls: {
      contracts: [],
      selectors: [],
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
      kyber: mocks.kyberIntegratee,
      makerDao: {
        dai: mocks.tokens.dai,
        pot: mocks.chaiPriceSource,
      },
      uniswapV2: {
        router: mocks.uniswapV2Integratee,
        factory: mocks.uniswapV2Integratee,
      },
      zeroExV2: {
        // TODO
        allowedMakers: [randomAddress()],
        exchange: mocks.zeroExV2Integratee,
        erc20Proxy: randomAddress(),
      },
    },
  };
}

export async function makeEthRich(sender: SignerWithAddress, receiver: AddressLike, amount = utils.parseEther('100')) {
  return sender.sendTransaction({
    to: resolveAddress(receiver),
    value: amount,
  });
}

export async function makeWethRich(weth: WETH, account: SignerWithAddress, amount = utils.parseEther('100')) {
  const connected = weth.connect(account);
  return connected.deposit.value(amount).send();
}

export function makeTokenRich(tokens: MockToken[], receiver: AddressLike, amount = utils.parseEther('1000000')) {
  const promises = tokens.map((token) => {
    return token.mintFor(receiver, amount);
  });

  return Promise.all(promises);
}
