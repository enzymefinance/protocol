import { AddressLike, randomAddress, resolveAddress, SignerWithAddress } from '@crestproject/crestproject';
import {
  CentralizedRateProvider,
  Dispatcher,
  encodeZeroExV2AssetData,
  MockCEtherIntegratee,
  MockChaiIntegratee,
  MockChainlinkPriceSource,
  MockChaiPriceSource,
  MockCTokenIntegratee,
  MockGenericAdapter,
  MockGenericIntegratee,
  MockKyberIntegratee,
  MockParaSwapIntegratee,
  MockReentrancyToken,
  MockSynthetixIntegratee,
  MockSynthetixPriceSource,
  MockSynthetixToken,
  MockToken,
  MockUniswapV2Integratee,
  MockUniswapV2PriceSource,
  MockZeroExV2Integratee,
  sighash,
  WETH,
} from '@enzymefinance/protocol';
import { BigNumber, utils } from 'ethers';
import { Deployment, DeploymentHandlers, describeDeployment } from '../deployment';
import { ReleaseDeploymentConfig } from './deployment';

enum RateAssets {
  ETH,
  USD,
}

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
    mrt: MockReentrancyToken;
  }>;
  uniswapV2Derivatives: Promise<{
    mlnWeth: MockUniswapV2PriceSource;
    kncWeth: MockUniswapV2PriceSource;
    usdcWeth: MockUniswapV2PriceSource;
  }>;
  compoundTokens: Promise<{
    cbat: MockCTokenIntegratee;
    ccomp: MockCTokenIntegratee;
    cdai: MockCTokenIntegratee;
    ceth: MockCEtherIntegratee;
    crep: MockCTokenIntegratee;
    cuni: MockCTokenIntegratee;
    cusdc: MockCTokenIntegratee;
    czrx: MockCTokenIntegratee;
  }>;
  kyberIntegratee: Promise<MockKyberIntegratee>;
  chaiIntegratee: Promise<MockChaiIntegratee>;
  paraswapIntegratee: Promise<MockParaSwapIntegratee>;
  uniswapV2Integratee: Promise<MockUniswapV2Integratee>;
  centralizedRateProvider: Promise<CentralizedRateProvider>;
  mockGenericAdapter: Promise<MockGenericAdapter>;
  mockGenericIntegratee: Promise<MockGenericIntegratee>;
  synthetix: Promise<{
    mockSynthetixIntegratee: MockSynthetixIntegratee;
    mockSynthetixPriceSource: MockSynthetixPriceSource;
    synths: Record<string, MockSynthetixToken>;
    currencyKeys: string[];
    aggregators: AddressLike[];
    rateAssets: RateAssets[];
  }>;
  chainlinkEthUsdAggregator: Promise<MockChainlinkPriceSource>;
  chainlinkAggregators: Promise<{
    aud: MockChainlinkPriceSource;
    bat: MockChainlinkPriceSource;
    bnb: MockChainlinkPriceSource;
    bnt: MockChainlinkPriceSource;
    btc: MockChainlinkPriceSource;
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
    xau: MockChainlinkPriceSource;
    zrx: MockChainlinkPriceSource;
    susd: MockChainlinkPriceSource;
    mrt: MockChainlinkPriceSource;
  }>;
  chaiPriceSource: Promise<MockChaiPriceSource>;
}

export type MockDeployment = Deployment<DeploymentHandlers<MockDeploymentConfig, MockDeploymentOutput>>;

export const deployMocks = describeDeployment<MockDeploymentConfig, MockDeploymentOutput>({
  // Assets
  async tokens(config) {
    const weth = await WETH.deploy(config.deployer);

    const [bat, bnb, bnt, comp, dai, knc, link, mana, mln, ren, rep, uni, usdc, usdt, zrx, mrt] = await Promise.all([
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
      MockReentrancyToken.deploy(config.deployer),
    ]);

    return {
      weth,
      bat,
      bnb,
      bnt,
      comp,
      dai,
      knc,
      link,
      mana,
      mln,
      ren,
      rep,
      uni,
      usdc,
      usdt,
      zrx,
      mrt: mrt as MockReentrancyToken,
    };
  },
  // NOTE: Every mock cToken is initialized with a rate 2 (18 decimals)
  async compoundTokens(config, deployment) {
    const tokens = await deployment.tokens;
    const ceth = await MockCEtherIntegratee.deploy(
      config.deployer,
      'Compound Ether',
      'cETH',
      8,
      tokens.weth,
      await deployment.centralizedRateProvider,
      utils.parseUnits('2', 28),
    );
    const [cbat, ccomp, cdai, crep, cuni, cusdc, czrx] = await Promise.all([
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound Basic Attention Token',
        'cBAT',
        8,
        tokens.bat,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 28),
      ),
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound Collateral',
        'cCOMP',
        8,
        tokens.comp,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 28),
      ),
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound Dai',
        'cDAI',
        8,
        tokens.dai,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 28),
      ),
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound Augur',
        'cREP',
        8,
        tokens.rep,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 28),
      ),
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound Uniswap',
        'cUNI',
        8,
        tokens.rep,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 28),
      ),
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound USD Coin',
        'cUSDC',
        8,
        tokens.usdc,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 16),
      ),
      MockCTokenIntegratee.deploy(
        config.deployer,
        'Compound 0x',
        'cZRX',
        8,
        tokens.zrx,
        await deployment.centralizedRateProvider,
        utils.parseUnits('2', 28),
      ),
    ]);
    return { ceth, cbat, ccomp, cdai, crep, cuni, cusdc, czrx };
  },
  async uniswapV2Derivatives(config, deployment) {
    const tokens = await deployment.tokens;
    const [mlnWeth, kncWeth, usdcWeth] = await Promise.all([
      MockUniswapV2PriceSource.deploy(
        config.deployer,
        await deployment.centralizedRateProvider,
        tokens.mln,
        tokens.weth,
      ),
      MockUniswapV2PriceSource.deploy(
        config.deployer,
        await deployment.centralizedRateProvider,
        tokens.knc,
        tokens.weth,
      ),
      MockUniswapV2PriceSource.deploy(
        config.deployer,
        await deployment.centralizedRateProvider,
        tokens.usdc,
        tokens.weth,
      ),
    ]);

    return { mlnWeth, kncWeth, usdcWeth };
  },
  // Price feed sources
  async chaiPriceSource(config) {
    return MockChaiPriceSource.deploy(config.deployer);
  },
  async chainlinkAggregators(config) {
    const [
      aud,
      bat,
      bnb,
      bnt,
      btc,
      comp,
      dai,
      knc,
      link,
      mana,
      mln,
      ren,
      rep,
      uni,
      usdc,
      usdt,
      xau,
      zrx,
      mrt,
      susd,
    ] = await Promise.all([
      MockChainlinkPriceSource.deploy(config.deployer, 8),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 8),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 8),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 8),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 8),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
      MockChainlinkPriceSource.deploy(config.deployer, 18),
    ]);

    return { aud, bat, bnb, bnt, btc, comp, dai, knc, link, mana, mln, ren, rep, uni, usdc, usdt, xau, zrx, mrt, susd };
  },
  async chainlinkEthUsdAggregator(config) {
    return MockChainlinkPriceSource.deploy(config.deployer, 8);
  },
  async chainlinkXauUsdAggregator(config) {
    return MockChainlinkPriceSource.deploy(config.deployer, 8);
  },
  // Adapter integratees
  async chaiIntegratee(config, deployment) {
    const tokens = await deployment.tokens;
    return MockChaiIntegratee.deploy(config.deployer, tokens.dai, await deployment.centralizedRateProvider, 18);
  },
  async kyberIntegratee(config, deployment) {
    const tokens = await deployment.tokens;
    return MockKyberIntegratee.deploy(config.deployer, await deployment.centralizedRateProvider, tokens.weth, 0);
  },
  async mockGenericAdapter(config, deployment) {
    return MockGenericAdapter.deploy(config.deployer, await deployment.mockGenericIntegratee);
  },
  async mockGenericIntegratee(config) {
    return MockGenericIntegratee.deploy(config.deployer);
  },
  async paraswapIntegratee(config, deployment) {
    return MockParaSwapIntegratee.deploy(config.deployer, await deployment.centralizedRateProvider, 0);
  },
  async centralizedRateProvider(config, deployment) {
    return CentralizedRateProvider.deploy(config.deployer, (await deployment.tokens).weth, 0);
  },
  async synthetix(config, deployment) {
    const synthSymbols = ['sAUD', 'sBNB', 'sBTC', 'sUSD'];
    const rateAssets = [RateAssets.USD, RateAssets.ETH, RateAssets.USD, RateAssets.USD];
    const aggregators = await deployment.chainlinkAggregators;
    const synthAggregators = [aggregators.aud, aggregators.bnb, aggregators.btc, aggregators.susd];

    const symbolToCurrencyKeys = synthSymbols.reduce(
      (carry, current) => ({ ...carry, [current.toLowerCase()]: utils.formatBytes32String(current) }),
      {},
    ) as Record<string, string>;

    const synthTokens = await Promise.all(
      synthSymbols.map((synth) =>
        MockSynthetixToken.deploy(
          config.deployer,
          `Synth ${synth}`,
          synth,
          18,
          symbolToCurrencyKeys[synth.toLowerCase()],
        ),
      ),
    );

    const symbolToSynth = synthSymbols
      .map((symbol) => symbol.toLowerCase())
      .reduce((carry, current, index) => ({ ...carry, [current]: synthTokens[index].address }), {}) as Record<
      string,
      MockSynthetixToken
    >;

    const mockSynthetixPriceSource = await MockSynthetixPriceSource.deploy(
      config.deployer,
      await deployment.chainlinkEthUsdAggregator,
    );

    const mockSynthetixIntegratee = await MockSynthetixIntegratee.deploy(
      config.deployer,
      5,
      mockSynthetixPriceSource.address,
    );

    return {
      mockSynthetixIntegratee,
      mockSynthetixPriceSource,
      currencyKeys: Object.values(symbolToCurrencyKeys),
      synths: symbolToSynth,
      aggregators: synthAggregators,
      rateAssets,
    };
  },
  async uniswapV2Integratee(config, deployment) {
    const derivatives = await deployment.uniswapV2Derivatives;
    const tokens = await deployment.tokens;
    return MockUniswapV2Integratee.deploy(
      config.deployer,
      [tokens.mln, tokens.knc],
      [tokens.weth, tokens.weth],
      [derivatives.mlnWeth, derivatives.kncWeth],
      await deployment.centralizedRateProvider,
      0,
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
  dispatcher,
  mocks,
  accounts,
}: {
  deployer: SignerWithAddress;
  dispatcher: Dispatcher;
  mocks: MockDeployment;
  accounts: SignerWithAddress[];
}): Promise<ReleaseDeploymentConfig> {
  const integratees = [
    mocks.chaiIntegratee,
    mocks.kyberIntegratee,
    mocks.mockGenericIntegratee,
    mocks.paraswapIntegratee,
    mocks.synthetix.mockSynthetixIntegratee,
    mocks.uniswapV2Integratee,
    ...Object.values(mocks.compoundTokens),
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
    mocks.tokens.mrt,
    mocks.chaiIntegratee,
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
    mocks.tokens.mrt,
    mocks.synthetix.synths.susd,
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
    mocks.chainlinkAggregators.mrt,
    mocks.chainlinkAggregators.susd,
  ];

  const chainlinkRateAssets = [
    RateAssets.ETH, // bat
    RateAssets.USD, // bnb
    RateAssets.ETH, // bnt
    RateAssets.ETH, // comp
    RateAssets.ETH, // dai
    RateAssets.ETH, // knc
    RateAssets.ETH, // link
    RateAssets.ETH, // mana
    RateAssets.ETH, // mln
    RateAssets.USD, // ren
    RateAssets.ETH, // rep
    RateAssets.ETH, // uni
    RateAssets.ETH, // usdc
    RateAssets.ETH, // usdt
    RateAssets.ETH, // zrx
    RateAssets.ETH, // MRT/ETH
    RateAssets.ETH, // susd
  ];

  // SEED ACCOUNTS AND INTEGRATEES WITH ASSETS

  // Uniswap

  await seedUniswapPairs(mocks.tokens.weth, Object.values(uniswapV2Derivatives), mocks.uniswapV2Integratee, deployer);

  // Compound

  const underlyingTokens = [
    mocks.tokens.bat,
    mocks.tokens.comp,
    mocks.tokens.dai,
    mocks.tokens.rep,
    mocks.tokens.uni,
    mocks.tokens.usdc,
    mocks.tokens.zrx,
  ];

  const cTokens = [
    mocks.compoundTokens.cbat,
    mocks.compoundTokens.ccomp,
    mocks.compoundTokens.cdai,
    mocks.compoundTokens.crep,
    mocks.compoundTokens.cuni,
    mocks.compoundTokens.cusdc,
    mocks.compoundTokens.czrx,
  ];

  await seedCTokens(deployer, underlyingTokens, cTokens, mocks.compoundTokens.ceth);

  // Synthetix

  const synthTokens = Object.values(mocks.synthetix.synths).map(
    (tokenAddress) => new MockSynthetixToken(tokenAddress, deployer),
  );

  await mocks.synthetix.mockSynthetixPriceSource.setPriceSourcesForCurrencyKeys(
    Object.values(mocks.synthetix.currencyKeys),
    Object.values(mocks.synthetix.aggregators),
    mocks.synthetix.rateAssets,
  );

  await mocks.synthetix.mockSynthetixIntegratee.setSynthFromCurrencyKeys(
    Object.values(mocks.synthetix.currencyKeys),
    synthTokens,
  );

  // SEED EOAs
  const allCTokens = [
    new MockToken(mocks.compoundTokens.ceth, deployer),
    ...cTokens.map((cToken) => new MockToken(cToken, deployer)),
  ];
  const EOATokensToMakeRich = [...Object.values(tokens), ...allCTokens, ...synthTokens];
  await Promise.all<any>([
    makeWethRich(mocks.tokens.weth, deployer),
    makeTokenRich(EOATokensToMakeRich, deployer),
    ...accounts.map(async (account) => {
      await Promise.all([makeTokenRich(EOATokensToMakeRich, account), makeWethRich(mocks.tokens.weth, account)]);
    }),
  ]);

  // SEED INTEGRATEES
  await Promise.all(
    integratees.map(async (integratee) => {
      await Promise.all([
        mocks.tokens.weth.transfer(integratee, utils.parseEther('100')),
        makeEthRich(deployer, integratee),
        makeTokenRich(tokens, integratee),
        makeTokenRich(synthTokens, integratee),
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
      synthetix: {
        saud: mocks.synthetix.synths.saud,
        sbnb: mocks.synthetix.synths.sbnb,
        sbtc: mocks.synthetix.synths.sbtc,
        susd: mocks.synthetix.synths.susd,
      },
      uniswapV2: {
        mlnWeth: mocks.uniswapV2Derivatives.mlnWeth,
        kncWeth: mocks.uniswapV2Derivatives.kncWeth,
        usdcWeth: mocks.uniswapV2Derivatives.usdcWeth,
      },
      wdgld: randomAddress(),
    },
    dispatcher: dispatcher,
    mln: mocks.tokens.mln,
    weth: mocks.tokens.weth,
    registeredVaultCalls: {
      contracts: [mocks.synthetix.mockSynthetixIntegratee],
      selectors: [sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)'))],
    },
    compoundComptroller: randomAddress(),
    chainlink: {
      ethUsdAggregator: mocks.chainlinkEthUsdAggregator,
      xauUsdAggregator: mocks.chainlinkXauUsdAggregator,
      staleRateThreshold: 259200, // 72 hours
      aggregators: chainlinkAggregators,
      primitives: chainlinkPrimitives,
      rateAssets: chainlinkRateAssets,
    },
    integratees: {
      // TODO
      kyber: mocks.kyberIntegratee,
      synthetix: {
        addressResolver: mocks.synthetix.mockSynthetixIntegratee,
        delegateApprovals: mocks.synthetix.mockSynthetixIntegratee,
        snx: mocks.synthetix.mockSynthetixIntegratee,
        susd: mocks.synthetix.synths.susd,
        originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
        trackingCode: utils.formatBytes32String('ENZYME'),
      },
      makerDao: {
        dai: mocks.tokens.dai,
        pot: mocks.chaiPriceSource,
      },
      paraswap: {
        augustusSwapper: mocks.paraswapIntegratee,
        tokenTransferProxy: mocks.paraswapIntegratee,
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
    policies: {
      guaranteedRedemption: {
        redemptionWindowBuffer: 300, // 5 minutes
      },
    },
  };
}

export async function makeEthRich(
  sender: SignerWithAddress,
  receiver: AddressLike,
  amount = utils.parseUnits('1', 22),
) {
  return sender.sendTransaction({
    to: resolveAddress(receiver),
    value: amount,
  });
}

export async function makeWethRich(weth: WETH, account: SignerWithAddress, amount = utils.parseUnits('1', 22)) {
  const connected = weth.connect(account);
  return connected.deposit.value(amount).send();
}

export async function seedUniswapPairs(
  weth: WETH,
  pairs: MockUniswapV2PriceSource[],
  integratee: MockUniswapV2Integratee,
  provider: SignerWithAddress,
) {
  const seedAmount = utils.parseUnits('1', 27);
  const promises = pairs.map(async (pair) => {
    const token0 = new MockToken(await pair.token0(), provider);
    const token1 = new MockToken(await pair.token1(), provider);

    // seed integratee with pair tokens
    // NOTE: In order to avoid liquidity problems, integratees should hold most of the liquidity (in this case, we keep 1% of supply for the deployer).
    // Thus, pairTokens should not be minted, as doing so we reduce the purchase power of the integratee
    const pairToken = new MockToken(pair, provider);
    const totalSupplyPair = await pairToken.totalSupply();
    const seedIntegrateeWithPair = pairToken.transfer(integratee, totalSupplyPair.mul(99).div(100));

    const seedPairWithTokens = [token0, token1].map(async (token) => {
      if (token.address == weth.address) {
        await makeWethRich(weth, provider, seedAmount);
        return weth.transfer(pair, seedAmount);
      } else {
        return makeTokenRich([token], pair, seedAmount);
      }
    });
    return [seedPairWithTokens, seedIntegrateeWithPair];
  });

  return Promise.all(promises);
}

export async function seedCTokens(
  provider: SignerWithAddress,
  tokens: MockToken[],
  cTokens: MockCTokenIntegratee[],
  ceth: MockCTokenIntegratee | MockCEtherIntegratee,
  tokenAmount = utils.parseUnits('1', 27),
  cTokenAmount = utils.parseUnits('1', 27),
) {
  const promises = [];
  for (const index in tokens) {
    const mockToken = new MockToken(cTokens[index], provider);
    promises.push(mockToken.mintFor(cTokens[index].address, cTokenAmount));

    const token = new MockToken(tokens[index], provider);
    promises.push(token.mintFor(cTokens[index].address, tokenAmount));
  }
  const cethAsToken = new MockToken(ceth.address, provider);
  const cethInitPromises = [cethAsToken.mintFor(ceth, cTokenAmount), makeEthRich(provider, cethAsToken.address)];
  return promises.push(cethInitPromises);
}

export function makeTokenRich(tokens: MockToken[], receiver: AddressLike, amount = BigNumber.from(0)) {
  const promises = tokens.map(async (token) => {
    if (amount.eq(BigNumber.from(0))) {
      amount = utils.parseUnits('10000', await token.decimals());
    }
    return token.mintFor(receiver, amount);
  });

  return Promise.all(promises);
}
