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
    bat: MockToken;
    bnb: MockToken;
    bnt: MockToken;
    comp: MockToken;
    dai: MockToken;
    knc: MockToken;
    link: MockToken;
    mana: MockToken;
    mln: MockToken;
    ren: MockToken;
    rep: MockToken;
    uni: MockToken;
    usdc: MockToken;
    usdt: MockToken;
    zrx: MockToken;
  }>;
  uniswapV2Derivatives: Promise<{
    mlnWeth: MockToken;
    kncWeth: MockToken;
  }>;
  compoundTokens: Promise<{
    cbat: MockToken;
    ccomp: MockToken;
    cdai: MockToken;
    ceth: MockToken;
    crep: MockToken;
    cuni: MockToken;
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
    bat: MockChainlinkPriceSource;
    bnb: MockChainlinkPriceSource;
    bnt: MockChainlinkPriceSource;
    comp: MockChainlinkPriceSource;
    dai: MockChainlinkPriceSource;
    knc: MockChainlinkPriceSource;
    link: MockChainlinkPriceSource;
    mana: MockChainlinkPriceSource;
    mln: MockChainlinkPriceSource;
    ren: MockChainlinkPriceSource;
    rep: MockChainlinkPriceSource;
    uni: MockChainlinkPriceSource;
    usdc: MockChainlinkPriceSource;
    usdt: MockChainlinkPriceSource;
    zrx: MockChainlinkPriceSource;
  }>;
  chaiPriceSource: Promise<MockChaiPriceSource>;
}

export type MockDeployment = Deployment<DeploymentHandlers<MockDeploymentConfig, MockDeploymentOutput>>;

export const deployMocks = describeDeployment<MockDeploymentConfig, MockDeploymentOutput>({
  // Assets
  async tokens(config) {
    const weth = await WETH.deploy(config.deployer);

    const [bat, bnb, bnt, comp, dai, knc, link, mana, mln, ren, rep, uni, usdc, usdt, zrx] = await Promise.all([
      MockToken.deploy(config.deployer, 'Basic Attention Token', 'BAT', 18),
      MockToken.deploy(config.deployer, 'BNB', 'BNB', 18),
      MockToken.deploy(config.deployer, 'Bancor Network Token', 'BNT', 18),
      MockToken.deploy(config.deployer, 'Compound', 'COMP', 18),
      MockToken.deploy(config.deployer, 'Dai Stablecoin', 'DAI', 18),
      MockToken.deploy(config.deployer, 'Kyber Network Crystal', 'KNC', 18),
      MockToken.deploy(config.deployer, 'ChainLink Token', 'LINK', 18),
      MockToken.deploy(config.deployer, 'Decentraland MANA', 'MANA', 18),
      MockToken.deploy(config.deployer, 'Melon Token', 'MLN', 18),
      MockToken.deploy(config.deployer, 'Republic Token', 'REN', 18),
      MockToken.deploy(config.deployer, 'Reputation', 'REP', 18),
      MockToken.deploy(config.deployer, 'Uniswap', 'UNI', 18),
      MockToken.deploy(config.deployer, 'USD Coin', 'USDC', 6),
      MockToken.deploy(config.deployer, 'Tether USD', 'USDT', 6),
      MockToken.deploy(config.deployer, '0x Protocol Token', 'ZRX', 18),
    ]);

    return { weth, bat, bnb, bnt, comp, dai, knc, link, mana, mln, ren, rep, uni, usdc, usdt, zrx };
  },
  async compoundTokens(config, deployment) {
    const tokens = await deployment.tokens;
    const ceth = await MockToken.deploy(config.deployer, 'Compound Ether', 'cETH', 8);
    const [cbat, ccomp, cdai, crep, cuni, cusdc, czrx] = await Promise.all([
      // TODO: deploy MockCEther contract
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Basic Attention Token', 'cBAT', 8, tokens.comp),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Collateral', 'cCOMP', 8, tokens.comp),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Dai', 'cDAI', 8, tokens.dai),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Augur', 'cREP', 8, tokens.rep),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound Uniswap', 'cUNI', 8, tokens.rep),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound USD Coin', 'cUSDC', 8, tokens.usdc),
      MockCTokenIntegratee.deploy(config.deployer, 'Compound 0x', 'cZRX', 8, tokens.zrx),
    ]);

    return { cbat, ccomp, cdai, ceth, crep, cuni, cusdc, czrx };
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
    const [bat, bnb, bnt, comp, dai, knc, link, mana, mln, ren, rep, uni, usdc, usdt, zrx] = await Promise.all([
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 6),
      MockChainlinkPriceSource.deploy(config.deployer, 6),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
    ]);

    return { bat, bnb, bnt, comp, dai, knc, link, mana, mln, ren, rep, uni, usdc, usdt, zrx };
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
    mocks.tokens.bat,
    mocks.tokens.bnb,
    mocks.tokens.bnt,
    mocks.tokens.comp,
    mocks.tokens.dai,
    mocks.tokens.knc,
    mocks.tokens.link,
    mocks.tokens.mana,
    mocks.tokens.mln,
    mocks.tokens.ren,
    mocks.tokens.rep,
    mocks.tokens.uni,
    mocks.tokens.usdc,
    mocks.tokens.usdt,
    mocks.tokens.zrx,
    mocks.uniswapV2Derivatives.mlnWeth,
    mocks.uniswapV2Derivatives.kncWeth,
    mocks.chaiIntegratee,
    mocks.compoundTokens.ccomp,
    mocks.compoundTokens.cdai,
    mocks.compoundTokens.ceth,
    mocks.compoundTokens.crep,
    mocks.compoundTokens.cusdc,
    mocks.compoundTokens.czrx,
  ];

  const uniswapV2Derivatives = [mocks.uniswapV2Derivatives.mlnWeth, mocks.uniswapV2Derivatives.kncWeth];

  const chainlinkPrimitives = [
    mocks.tokens.bat,
    mocks.tokens.bnb,
    mocks.tokens.bnt,
    mocks.tokens.comp,
    mocks.tokens.dai,
    mocks.tokens.knc,
    mocks.tokens.link,
    mocks.tokens.mana,
    mocks.tokens.mln,
    mocks.tokens.ren,
    mocks.tokens.rep,
    mocks.tokens.uni,
    mocks.tokens.usdc,
    mocks.tokens.usdt,
    mocks.tokens.zrx,
  ];

  const chainlinkAggregators = [
    mocks.chainlinkAggregators.bat,
    mocks.chainlinkAggregators.bnb,
    mocks.chainlinkAggregators.bnt,
    mocks.chainlinkAggregators.comp,
    mocks.chainlinkAggregators.dai,
    mocks.chainlinkAggregators.knc,
    mocks.chainlinkAggregators.link,
    mocks.chainlinkAggregators.mana,
    mocks.chainlinkAggregators.mln,
    mocks.chainlinkAggregators.ren,
    mocks.chainlinkAggregators.rep,
    mocks.chainlinkAggregators.uni,
    mocks.chainlinkAggregators.usdc,
    mocks.chainlinkAggregators.usdt,
    mocks.chainlinkAggregators.zrx,
  ];

  const chainlinkRateAssets = [
    0, // bat
    1, // bnb
    0, // bnt
    0, // comp
    0, // dai
    0, // knc
    0, // link
    0, // mana
    0, // mln
    1, // ren
    0, // rep
    0, // uni
    0, // usdc
    0, // usdt
    0, // zrx
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
        cbat: mocks.compoundTokens.cbat,
        ccomp: mocks.compoundTokens.ccomp,
        cdai: mocks.compoundTokens.cdai,
        ceth: mocks.compoundTokens.ceth,
        crep: mocks.compoundTokens.crep,
        cuni: mocks.compoundTokens.cuni,
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
