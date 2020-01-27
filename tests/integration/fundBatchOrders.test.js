/*
 * @file Tests a fund trading with multiple orders batched into one tx
 *
 * @test A fund takes two orders, with same assets, from same exchange
 * @test A fund takes two orders, with same assets, from different exchange
 * @test A fund takes three orders, with different assets, from different exchanges
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS, KYBER_ETH_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';
import {
  createUnsignedZeroExOrder,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer, manager, investor, thirdParty;
let defaultTxOpts, managerTxOpts, investorTxOpts, thirdPartyTxOpts;
let takeOrderFunctionSig;
let dai, mln, weth, priceSource;
let kyberNetworkProxy, oasisDexExchange, zeroExErc20Proxy, zeroExExchange;
let kyberExchangeIndex, oasisDexExchangeIndex, zeroExExchangeIndex;
let fund;
let daiToEthRate, mlnToEthRate, wethToEthRate;

beforeAll(async () => {
  [deployer, manager, investor, thirdParty] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  thirdPartyTxOpts = { ...defaultTxOpts, from: thirdParty };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );

  priceSource = contracts.TestingPriceFeed;
  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;

  kyberNetworkProxy = contracts.KyberNetworkProxy;
  oasisDexExchange = contracts.OasisDexExchange;
  zeroExErc20Proxy = contracts.ZeroExV2ERC20Proxy;
  zeroExExchange = contracts.ZeroExV2Exchange;

  const kyberAdapter = contracts.KyberAdapter;
  const oasisDexAdapter = contracts.OasisDexAdapter;
  const version = contracts.Version;
  const zeroExAdapter = contracts.ZeroExV2Adapter;

  // Set initial prices to be predictably the same as prices when updated again later
  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  daiToEthRate = toWei('0.005', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address, dai.options.address],
      [wethToEthRate, mlnToEthRate, daiToEthRate],
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [
      kyberNetworkProxy.options.address,
      oasisDexExchange.options.address,
      zeroExExchange.options.address
    ],
    exchangeAdapters: [
      kyberAdapter.options.address,
      oasisDexAdapter.options.address,
      zeroExAdapter.options.address
    ],
    initialInvestment: {
      contribAmount: toWei('10', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });

  // Enable investment with dai
  await send(fund.participation, 'enableInvestment', [[dai.options.address]], managerTxOpts);

  const exchangeInfo = await call(fund.trading, 'getExchangeInfo');
  kyberExchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === kyberAdapter.options.address.toLowerCase()
  );
  zeroExExchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === zeroExAdapter.options.address.toLowerCase()
  );
  oasisDexExchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === oasisDexAdapter.options.address.toLowerCase()
  );

  await send(
    dai,
    'transfer',
    [investor, toWei('1000', 'ether')],
    defaultTxOpts
  );
  await send(
    mln,
    'transfer',
    [thirdParty, toWei('1', 'ether')],
    defaultTxOpts
  );
  await send(
    weth,
    'transfer',
    [thirdParty, toWei('1', 'ether')],
    defaultTxOpts
  );
});

test("fund takes two orders, with same assets, from same exchange", async () => {
  const { accounting, trading, vault } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, makerAsset, takerQuantity],
    defaultTxOpts
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const kyberOrderParams = [
    kyberExchangeIndex,
    takeOrderFunctionSig,
    [
      EMPTY_ADDRESS,
      EMPTY_ADDRESS,
      makerAsset,
      takerAsset,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS,
      EMPTY_ADDRESS
    ],
    [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
    ['0x0', '0x0', '0x0', '0x0'],
    '0x0',
    '0x0',
  ];
  const multiOrderParams = [[], [], [], [], [], [], []];
  const orders = [kyberOrderParams, kyberOrderParams];
  for (const order of orders) {
    for (const key in order) {
      multiOrderParams[key].push(order[key]);
    }
  };

  const preMlnFundHoldings = new BN(
    await call(accounting, 'assetHoldings', [mln.options.address])
  );
  const preWethFundHoldings = new BN(
    await call(accounting, 'assetHoldings', [weth.options.address])
  );

  await send(
    trading,
    'multiCallOnExchange',
    multiOrderParams,
    managerTxOpts
  );

  const postMlnFundHoldings = new BN(
    await call(accounting, 'assetHoldings', [mln.options.address])
  );
  const postWethFundHoldings = new BN(
    await call(accounting, 'assetHoldings', [weth.options.address])
  );

  const expectedMakerAssetAdded = new BN(makerQuantity).mul(new BN(2));
  expect(postMlnFundHoldings).bigNumberEq(preMlnFundHoldings.add(expectedMakerAssetAdded));

  const expectedTakerAssetSubtracted = new BN(takerQuantity).mul(new BN(2));
  expect(postWethFundHoldings).bigNumberEq(preWethFundHoldings.sub(expectedTakerAssetSubtracted));
});

describe("fund takes two orders, with same assets, from different exchange", () => {
  let signedZeroExOrder;
  let zeroExOrderMakerAsset, zeroExOrderTakerAsset;

  test("third party makes order on 0x v2", async () => {
    const makerAddress = thirdParty;
    const makerAssetAmount = toWei('0.1', 'ether');
    const takerAssetAmount = toWei('0.05', 'ether');
    zeroExOrderMakerAsset = mln.options.address;
    zeroExOrderTakerAsset = weth.options.address;

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress,
        makerTokenAddress: zeroExOrderMakerAsset,
        makerAssetAmount,
        takerTokenAddress: zeroExOrderTakerAsset,
        takerAssetAmount,
      },
    );

    await send(
      mln,
      'approve',
      [zeroExErc20Proxy.options.address, makerAssetAmount],
      thirdPartyTxOpts
    );
    signedZeroExOrder = await signZeroExOrder(unsignedOrder, thirdParty);
    const signatureValid = await isValidZeroExSignatureOffChain(
      unsignedOrder,
      signedZeroExOrder.signature,
      thirdParty
    );
    expect(signatureValid).toBeTruthy();
  });

  test("fund takes two orders from different exchanges", async () => {
    const { accounting, trading, vault } = fund;

    const kyberOrder = {
      takerAsset: weth.options.address,
      takerQuantity: toWei('0.1', 'ether'),
      makerAsset: mln.options.address
    };

    const { 0: expectedKyberRate } = await call(
      kyberNetworkProxy,
      'getExpectedRate',
      [KYBER_ETH_ADDRESS, kyberOrder.makerAsset, kyberOrder.takerQuantity],
      defaultTxOpts
    );

    kyberOrder.makerQuantity = BNExpMul(
      new BN(kyberOrder.takerQuantity),
      new BN(expectedKyberRate),
    ).toString();

    const kyberOrderParams = [
      kyberExchangeIndex,
      takeOrderFunctionSig,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        kyberOrder.makerAsset,
        kyberOrder.takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        kyberOrder.makerQuantity,
        kyberOrder.takerQuantity,
        0,
        0,
        0,
        0,
        kyberOrder.takerQuantity,
        0
      ],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0',
    ];

    const zeroExOrderParams = [
      zeroExExchangeIndex,
      takeOrderFunctionSig,
      [
        signedZeroExOrder.makerAddress,
        EMPTY_ADDRESS,
        zeroExOrderMakerAsset,
        zeroExOrderTakerAsset,
        signedZeroExOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedZeroExOrder.makerAssetAmount,
        signedZeroExOrder.takerAssetAmount,
        signedZeroExOrder.makerFee,
        signedZeroExOrder.takerFee,
        signedZeroExOrder.expirationTimeSeconds,
        signedZeroExOrder.salt,
        signedZeroExOrder.takerAssetAmount,
        0,
      ],
      [
        signedZeroExOrder.makerAssetData,
        signedZeroExOrder.takerAssetData,
        '0x0',
        '0x0'
      ],
      '0x0',
      signedZeroExOrder.signature,
    ];

    const multiOrderParams = [[], [], [], [], [], [], []];
    const orders = [kyberOrderParams, zeroExOrderParams];
    for (const order of orders) {
      for (const key in order) {
        multiOrderParams[key].push(order[key]);
      }
    };

    const preMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const preWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    await send(
      trading,
      'multiCallOnExchange',
      multiOrderParams,
      managerTxOpts
    );

    const postMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const postWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    const expectedMakerAssetAdded = new BN(kyberOrder.makerQuantity).add(new BN(signedZeroExOrder.makerAssetAmount));
    expect(postMlnFundHoldings).bigNumberEq(preMlnFundHoldings.add(expectedMakerAssetAdded));

    const expectedTakerAssetSubtracted = new BN(kyberOrder.takerQuantity).add(new BN(signedZeroExOrder.takerAssetAmount));
    expect(postWethFundHoldings).bigNumberEq(preWethFundHoldings.sub(expectedTakerAssetSubtracted));
  });
});

describe("fund takes three orders, with different assets, from different exchanges", () => {
  let oasisDexOrder, signedZeroExOrder;
  let zeroExOrderMakerAsset, zeroExOrderTakerAsset;

  test("invest in fund with DAI, to use in take orders", async () => {
    const { accounting, participation, shares } = fund;
    const wantedShares = toWei('0.5', 'ether');
    const amguAmount = toWei('0.01', 'ether');

    const costOfShares = await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares, dai.options.address]
    );

    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

    await send(
      dai,
      'approve',
      [fund.participation.options.address, costOfShares],
      investorTxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares, costOfShares, dai.options.address],
      { ...investorTxOpts, value: amguAmount }
    );

    // Need price update before participation executed
    await delay(1000);
    await send(
      priceSource,
      'update',
      [
        [weth.options.address, mln.options.address, dai.options.address],
        [wethToEthRate, mlnToEthRate, daiToEthRate],
      ],
      defaultTxOpts
    );
    await send(
      participation,
      'executeRequestFor',
      [investor],
      investorTxOpts
    );

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(preInvestorShares.add(new BN(wantedShares)));
  });

  test("third party makes order on Oasis DEX", async () => {
    oasisDexOrder = {
      takerAsset: dai.options.address,
      takerQuantity: toWei('50', 'ether'),
      makerAsset: weth.options.address
    }
    const wethToDaiRate = new BN(
      (await call(priceSource, 'getPrice', [dai.options.address]))[0]
    );
    oasisDexOrder.makerQuantity = BNExpMul(
      new BN(oasisDexOrder.takerQuantity),
      wethToDaiRate
    ).toString();

    await send(
      weth,
      'approve',
      [oasisDexExchange.options.address, oasisDexOrder.makerQuantity],
      thirdPartyTxOpts
    );
    const res = await send(
      oasisDexExchange,
      'offer',
      [
        oasisDexOrder.makerQuantity,
        oasisDexOrder.makerAsset,
        oasisDexOrder.takerQuantity,
        oasisDexOrder.takerAsset,
        0
      ],
      thirdPartyTxOpts
    );

    const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
    oasisDexOrder.orderId = logMake.id;
  });

  test("third party makes order on 0x v2", async () => {
    const makerAddress = thirdParty;
    const makerAssetAmount = toWei('0.1', 'ether');
    const takerAssetAmount = toWei('0.05', 'ether');
    zeroExOrderMakerAsset = mln.options.address;
    zeroExOrderTakerAsset = weth.options.address;

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress,
        makerTokenAddress: zeroExOrderMakerAsset,
        makerAssetAmount,
        takerTokenAddress: zeroExOrderTakerAsset,
        takerAssetAmount,
      },
    );

    await send(
      mln,
      'approve',
      [zeroExErc20Proxy.options.address, makerAssetAmount],
      thirdPartyTxOpts
    );
    signedZeroExOrder = await signZeroExOrder(unsignedOrder, thirdParty);
    const signatureValid = await isValidZeroExSignatureOffChain(
      unsignedOrder,
      signedZeroExOrder.signature,
      thirdParty
    );
    expect(signatureValid).toBeTruthy();
  });

  test("fund takes three orders from different exchanges", async () => {
    const { accounting, trading, vault } = fund;

    const kyberOrder = {
      takerAsset: weth.options.address,
      takerQuantity: toWei('0.1', 'ether'),
      makerAsset: mln.options.address
    };
    const { 0: expectedKyberRate } = await call(
      kyberNetworkProxy,
      'getExpectedRate',
      [KYBER_ETH_ADDRESS, kyberOrder.makerAsset, kyberOrder.takerQuantity],
      defaultTxOpts
    );

    kyberOrder.makerQuantity = BNExpMul(
      new BN(kyberOrder.takerQuantity),
      new BN(expectedKyberRate),
    ).toString();

    const kyberOrderParams = [
      kyberExchangeIndex,
      takeOrderFunctionSig,
      [
        EMPTY_ADDRESS,
        trading.options.address,
        kyberOrder.makerAsset,
        kyberOrder.takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        kyberOrder.makerQuantity,
        kyberOrder.takerQuantity,
        0,
        0,
        0,
        0,
        kyberOrder.takerQuantity,
        0
      ],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0'
    ];

    const zeroExOrderParams = [
      zeroExExchangeIndex,
      takeOrderFunctionSig,
      [
        signedZeroExOrder.makerAddress,
        EMPTY_ADDRESS,
        zeroExOrderMakerAsset,
        zeroExOrderTakerAsset,
        signedZeroExOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedZeroExOrder.makerAssetAmount,
        signedZeroExOrder.takerAssetAmount,
        signedZeroExOrder.makerFee,
        signedZeroExOrder.takerFee,
        signedZeroExOrder.expirationTimeSeconds,
        signedZeroExOrder.salt,
        signedZeroExOrder.takerAssetAmount,
        0,
      ],
      [
        signedZeroExOrder.makerAssetData,
        signedZeroExOrder.takerAssetData,
        '0x0',
        '0x0'
      ],
      '0x0',
      signedZeroExOrder.signature
    ];

    const oasisDexOrderParams = [
      oasisDexExchangeIndex,
      takeOrderFunctionSig,
      [
        thirdParty,
        trading.options.address,
        oasisDexOrder.makerAsset,
        oasisDexOrder.takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        oasisDexOrder.makerQuantity,
        oasisDexOrder.takerQuantity,
        0,
        0,
        0,
        0,
        oasisDexOrder.takerQuantity,
        0
      ],
      ['0x0', '0x0', '0x0', '0x0'],
      oasisDexOrder.orderId,
      '0x0'
    ];
    const orders = [kyberOrderParams, zeroExOrderParams, oasisDexOrderParams];
    // TODO: more elegant way to merge multidimensional arrays
    const multiOrderParams = [[], [], [], [], [], [], []];
    for (const order of orders) {
      for (const key in order) {
        multiOrderParams[key].push(order[key]);
      }
    };

    const preDaiFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [dai.options.address])
    );
    const preMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const preWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    await send(
      trading,
      'multiCallOnExchange',
      multiOrderParams,
      managerTxOpts
    );

    const postDaiFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [dai.options.address])
    );
    const postMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const postWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    const expectedDai = preDaiFundHoldings.sub(new BN(oasisDexOrder.takerQuantity))
    expect(postDaiFundHoldings).bigNumberEq(expectedDai);

    const expectedMln =
      preMlnFundHoldings
        .add(new BN(signedZeroExOrder.makerAssetAmount))
        .add(new BN(kyberOrder.makerQuantity));
    expect(postMlnFundHoldings).bigNumberEq(expectedMln);

    const expectedWeth =
      preWethFundHoldings
        .add(new BN(oasisDexOrder.makerQuantity))
        .sub(new BN(signedZeroExOrder.takerAssetAmount))
        .sub(new BN(kyberOrder.takerQuantity));
    expect(postWethFundHoldings).bigNumberEq(expectedWeth);
  });
});
