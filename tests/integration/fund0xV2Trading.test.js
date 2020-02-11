/*
 * @file Tests funds trading via the 0x adapter
 *
 * @test Fund takes an order
 * @test Fund takes an order with a taker fee
 */

import { orderHashUtils } from '@0x/order-utils-v2';
import { BN, toWei } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';
import {
  createUnsignedZeroExOrder,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts;
let mln, zrx, weth, erc20Proxy, priceSource, zeroExExchange;
let fund;
<<<<<<< HEAD
let takeOrderSignature;
=======
let makeOrderSignature, takeOrderSignature, cancelOrderSignature, testTakeOrderSignature;
>>>>>>> refactor: test encoding and decoding takeOrder's parameters
let exchangeIndex;
let mlnToEthRate, wethToEthRate, zrxToEthRate;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  
  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );
<<<<<<< HEAD
=======
  cancelOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'cancelOrder',
  )
  testTakeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'testTakeOrder',
  );
>>>>>>> refactor: test encoding and decoding takeOrder's parameters

  mln = contracts.MLN;
  zrx = contracts.ZRX;
  weth = contracts.WETH;
  erc20Proxy = contracts.ZeroExV2ERC20Proxy;
  zeroExExchange = contracts.ZeroExV2Exchange;
  priceSource = contracts.TestingPriceFeed;

  const version = contracts.Version;
  const zeroExAdapter = contracts.ZeroExV2Adapter;

  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  zrxToEthRate = toWei('0.25', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address, zrx.options.address],
      [wethToEthRate, mlnToEthRate, zrxToEthRate],
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [zeroExExchange.options.address],
    exchangeAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });
  exchangeIndex = 0;
});

describe('Fund takes an order', () => {
  let signedOrder;

  test('third party makes and validates an off-chain order', async () => {
    const makerAddress = deployer;
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      },
    );

    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await isValidZeroExSignatureOffChain(
      unsignedOrder,
      signedOrder.signature,
      deployer
    );

    expect(signatureValid).toBeTruthy();
  });

  test('manager takes order through adapter', async () => {
    const { accounting, trading } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundAssetHoldings', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundAssetHoldings', [mln.options.address])
    );

<<<<<<< HEAD
    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        [
          deployer,
          EMPTY_ADDRESS,
          mln.options.address,
          weth.options.address,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [
          signedOrder.makerAssetAmount,
          signedOrder.takerAssetAmount,
          signedOrder.makerFee,
          signedOrder.takerFee,
          signedOrder.expirationTimeSeconds,
          signedOrder.salt,
          fillQuantity,
          0,
        ],
        [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundAssetHoldings', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundAssetHoldings', [mln.options.address])
    );

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));

    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(new BN(signedOrder.takerAssetAmount));
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });
});

describe('Fund takes an order with a taker fee', () => {
  let signedOrder;

  test('third party makes and validates an off-chain order', async () => {
=======
>>>>>>> refactor: test encoding and decoding takeOrder's parameters
    const makerAddress = deployer;
    const orderAddresses = [];
    const orderValues = [];
    const orderData = [];

    orderAddresses[0] = makerAddress;
    orderAddresses[1] = EMPTY_ADDRESS;
    orderAddresses[2] = EMPTY_ADDRESS;
    orderAddresses[3] = signedOrder.feeRecipientAddress;
    orderAddresses[4] = zeroExExchange.options.address;

    orderValues[0] = signedOrder.makerAssetAmount;
    orderValues[1] = signedOrder.takerAssetAmount;
    orderValues[2] = signedOrder.makerFee;
    orderValues[3] = signedOrder.takerFee;
    orderValues[4] = signedOrder.expirationTimeSeconds;
    orderValues[5] = signedOrder.salt;
    orderValues[6] = fillQuantity;

    orderData[0] = signedOrder.makerAssetData;
    orderData[1] = signedOrder.takerAssetData;
    orderData[2] = signedOrder.signature;

    for (const i in orderData) {
      orderData[i] = web3.utils.hexToBytes(orderData[i]);
    }

    const hex = web3.eth.abi.encodeParameters(
      ['address[5]', 'uint[7]', 'bytes[3]'],
      [orderAddresses, orderValues, orderData],
    );

<<<<<<< HEAD
    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await isValidZeroExSignatureOffChain(
      unsignedOrder,
      signedOrder.signature,
      deployer
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Invest in fund with enough ZRX to take trade with taker fee', async () => {
    const { accounting, participation, shares } = fund;
  
    // Enable investment with zrx
    await send(participation, 'enableInvestment', [[zrx.options.address]], managerTxOpts);
  
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('0.01', 'ether');
  
    const costOfShares = await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares, zrx.options.address]
    );
  
    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  
    await send(zrx, 'transfer', [investor, costOfShares], defaultTxOpts);
    await send(
      zrx,
      'approve',
      [participation.options.address, toWei('100', 'ether')],
      investorTxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares, costOfShares, zrx.options.address],
      { ...investorTxOpts, value: amguAmount }
    );
  
    // Need price update before participation executed
    await delay(1000);
    await send(
      priceSource,
      'update',
      [
        [weth.options.address, mln.options.address, zrx.options.address],
        [wethToEthRate, mlnToEthRate, zrxToEthRate],
      ],
      defaultTxOpts
    );
    await send(
      participation,
      'executeRequestFor',
      [investor],
      { ...investorTxOpts, value: amguAmount }
    );
  
    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(preInvestorShares.add(new BN(wantedShares)));
  });

  test('fund with enough ZRX takes order', async () => {
    const { accounting, trading } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const preFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [trading.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundAssetHoldings', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundAssetHoldings', [mln.options.address])
    );
    const preFundHoldingsZrx = new BN(
      await call(accounting, 'getFundAssetHoldings', [zrx.options.address])
    );
    
=======
    const encodedParameters = web3.utils.hexToBytes(hex);

>>>>>>> refactor: test encoding and decoding takeOrder's parameters
    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
<<<<<<< HEAD
        takeOrderSignature,
=======
        testTakeOrderSignature,
>>>>>>> refactor: test encoding and decoding takeOrder's parameters
        [
          deployer,
          EMPTY_ADDRESS,
          mln.options.address,
          weth.options.address,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [
          signedOrder.makerAssetAmount,
          signedOrder.takerAssetAmount,
          signedOrder.makerFee,
          signedOrder.takerFee,
          signedOrder.expirationTimeSeconds,
          signedOrder.salt,
          fillQuantity,
          0,
        ],
        [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        '0x0',
<<<<<<< HEAD
        signedOrder.signature
=======
        encodedParameters,
>>>>>>> refactor: test encoding and decoding takeOrder's parameters
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
<<<<<<< HEAD
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const postFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [trading.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundAssetHoldings', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundAssetHoldings', [mln.options.address])
    );
    const postFundHoldingsZrx = new BN(
      await call(accounting, 'getFundAssetHoldings', [zrx.options.address])
    );

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));

    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);
    const fundHoldingsZrxDiff = preFundHoldingsZrx.sub(postFundHoldingsZrx);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));
    expect(fundHoldingsZrxDiff).bigNumberEq(preFundBalanceOfZrx.sub(postFundBalanceOfZrx));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(new BN(signedOrder.takerAssetAmount));
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(signedOrder.makerAssetAmount));
    expect(fundHoldingsZrxDiff).bigNumberEq(new BN(signedOrder.takerFee));
  });
});
=======
    const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postWethHeldInExchange = new BN(
      await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    );

    expect(postWethHeldInExchange).bigNumberEq(new BN(0));
    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethVault).bigNumberEq(preWethVault.sub(new BN(signedOrder.takerAssetAmount)));
    expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
  });
});

// describe('Fund takes an order with a taker fee', () => {
  // let signedOrder;

  // test('third party makes and validates an off-chain order', async () => {
    // const makerAddress = deployer;
    // const takerFee = new BN(toWei('0.0001', 'ether'));

    // const makerAssetAmount = toWei('1', 'Ether');
    // const takerAssetAmount = toWei('0.05', 'Ether');

    // const unsignedOrder = await createUnsignedZeroExOrder(
      // zeroExExchange.options.address,
      // {
        // feeRecipientAddress: investor,
        // makerAddress,
        // makerTokenAddress: mln.options.address,
        // makerAssetAmount,
        // takerFee,
        // takerTokenAddress: weth.options.address,
        // takerAssetAmount,
      // },
    // );

    // await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);
    // signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    // const signatureValid = await isValidZeroExSignatureOffChain(
      // unsignedOrder,
      // signedOrder.signature,
      // deployer
    // );

    // expect(signatureValid).toBeTruthy();
  // });

  // test('fund with enough ZRX takes order', async () => {
    // const { trading, vault } = fund;
    // const fillQuantity = signedOrder.takerAssetAmount;

    // const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    // const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    // const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    // const preWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    // const preZrxVault = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

    // await send(
      // trading,
      // 'callOnExchange',
      // [
        // exchangeIndex,
        // takeOrderSignature,
        // [
          // deployer,
          // EMPTY_ADDRESS,
          // mln.options.address,
          // weth.options.address,
          // signedOrder.feeRecipientAddress,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS
        // ],
        // [
          // signedOrder.makerAssetAmount,
          // signedOrder.takerAssetAmount,
          // signedOrder.makerFee,
          // signedOrder.takerFee,
          // signedOrder.expirationTimeSeconds,
          // signedOrder.salt,
          // fillQuantity,
          // 0,
        // ],
        // [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        // '0x0',
        // signedOrder.signature
      // ],
      // managerTxOpts
    // );

    // const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    // const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    // const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    // const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    // const postZrxVault = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    // const postWethHeldInExchange = new BN(
      // await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    // );

    // expect(postWethHeldInExchange).bigNumberEq(new BN(0));
    // expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    // expect(postWethVault).bigNumberEq(preWethVault.sub(new BN(signedOrder.takerAssetAmount)));
    // expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(signedOrder.makerAssetAmount)));
    // expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
    // expect(postZrxVault).bigNumberEq(preZrxVault.sub(new BN(signedOrder.takerFee)));
  // });
// });

// describe('Fund makes an order', () => {
  // let signedOrder;

  // test('Make order through the fund', async () => {
    // const { trading } = fund;

    // const makerAddress = trading.options.address;
    // const makerTokenAddress = weth.options.address;
    // const makerAssetAmount = toWei('0.05', 'ether');
    // const takerTokenAddress = mln.options.address;
    // const takerAssetAmount = toWei('0.5', 'ether');

    // const unsignedOrder = await createUnsignedZeroExOrder(
      // zeroExExchange.options.address,
      // {
        // makerAddress,
        // makerTokenAddress,
        // makerAssetAmount,
        // takerTokenAddress,
        // takerAssetAmount,
      // },
    // );
    // signedOrder = await signZeroExOrder(unsignedOrder, manager);

    // await send(
      // trading,
      // 'callOnExchange',
      // [
        // exchangeIndex,
        // makeOrderSignature,
        // [
          // makerAddress,
          // EMPTY_ADDRESS,
          // makerTokenAddress,
          // takerTokenAddress,
          // signedOrder.feeRecipientAddress,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS
        // ],
        // [
          // signedOrder.makerAssetAmount,
          // signedOrder.takerAssetAmount,
          // signedOrder.makerFee,
          // signedOrder.takerFee,
          // signedOrder.expirationTimeSeconds,
          // signedOrder.salt,
          // 0,
          // 0,
        // ],
        // [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        // '0x0',
        // signedOrder.signature,
      // ],
      // managerTxOpts
    // );

    // const makerAssetAllowance = new BN(
      // await call(weth, 'allowance', [makerAddress, erc20Proxy.options.address])
    // );
    // expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  // });

  // test('Third party takes the order made by the fund, and accounting is updated', async () => {
    // const { accounting, trading } = fund;

    // const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    // const preMlnFundHoldings = new BN(
      // await call(accounting, 'assetHoldings', [mln.options.address])
    // );
    // const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    // const preWethFundHoldings = new BN(
      // await call(accounting, 'assetHoldings', [weth.options.address])
    // );

    // await send(
      // mln,
      // 'approve',
      // [erc20Proxy.options.address, signedOrder.takerAssetAmount],
      // defaultTxOpts
    // );
    // await send(
      // zeroExExchange,
      // 'fillOrder',
      // [
        // signedOrder,
        // signedOrder.takerAssetAmount,
        // signedOrder.signature
      // ],
      // defaultTxOpts
    // );

    // const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    // const postMlnFundHoldings = new BN(
      // await call(accounting, 'assetHoldings', [mln.options.address])
    // );
    // const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    // const postWethFundHoldings = new BN(
      // await call(accounting, 'assetHoldings', [weth.options.address])
    // );

    // await send(
      // trading,
      // 'updateAndGetQuantityBeingTraded',
      // [weth.options.address],
      // managerTxOpts
    // );

    // const isInOpenMakeOrder = await call(
      // trading,
      // 'isInOpenMakeOrder',
      // [weth.options.address]
    // );
    // expect(isInOpenMakeOrder).toEqual(false);

    // expect(postMlnFundHoldings).bigNumberEq(
      // preMlnFundHoldings.add(new BN(signedOrder.takerAssetAmount))
    // );
    // expect(postWethFundHoldings).bigNumberEq(
      // preWethFundHoldings.sub(new BN(signedOrder.makerAssetAmount))
    // );
    // expect(postMlnDeployer).bigNumberEq(
      // preMlnDeployer.sub(new BN(signedOrder.takerAssetAmount))
    // );
    // expect(postWethDeployer).bigNumberEq(
      // preWethDeployer.add(new BN(signedOrder.makerAssetAmount))
    // );
  // });
// });

// describe('Fund cancels an order', () => {
  // let signedOrder;

  // test("Make order through the fund with different maker asset", async () => {
    // const { trading } = fund;

    // const makerAddress = trading.options.address;
    // const makerTokenAddress = mln.options.address;
    // const makerAssetAmount = toWei('0.25', 'Ether');
    // const takerTokenAddress = weth.options.address;
    // const takerAssetAmount = toWei('0.025', 'Ether');

    // const unsignedOrder = await createUnsignedZeroExOrder(
      // zeroExExchange.options.address,
      // {
        // makerAddress,
        // makerTokenAddress,
        // makerAssetAmount,
        // takerTokenAddress,
        // takerAssetAmount,
      // },
    // );
    // signedOrder = await signZeroExOrder(unsignedOrder, manager);

    // await send(
      // trading,
      // 'callOnExchange',
      // [
        // exchangeIndex,
        // makeOrderSignature,
        // [
          // makerAddress,
          // EMPTY_ADDRESS,
          // makerTokenAddress,
          // takerTokenAddress,
          // signedOrder.feeRecipientAddress,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS
        // ],
        // [
          // signedOrder.makerAssetAmount,
          // signedOrder.takerAssetAmount,
          // signedOrder.makerFee,
          // signedOrder.takerFee,
          // signedOrder.expirationTimeSeconds,
          // signedOrder.salt,
          // 0,
          // 0,
        // ],
        // [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        // '0x0',
        // signedOrder.signature,
      // ],
      // managerTxOpts
    // );

    // const makerAssetAllowance = new BN(
      // await call(mln, 'allowance', [makerAddress, erc20Proxy.options.address])
    // );
    // expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  // });

  // test('Fund can cancel the order using just the orderId', async () => {
    // const { trading } = fund;

    // const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);

    // await send(
      // trading,
      // 'callOnExchange',
      // [
        // exchangeIndex,
        // cancelOrderSignature,
        // [
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS,
          // EMPTY_ADDRESS
        // ],
        // [0, 0, 0, 0, 0, 0, 0, 0],
        // ['0x0', '0x0', '0x0', '0x0'],
        // orderHashHex,
        // '0x0',
      // ],
      // managerTxOpts
    // );

    // const isOrderCancelled = await call(zeroExExchange, 'cancelled', [orderHashHex]);
    // const makerAssetAllowance = new BN(
      // await call(mln, 'allowance', [trading.options.address, erc20Proxy.options.address])
    // );

    // expect(makerAssetAllowance).bigNumberEq(new BN(0));
    // expect(isOrderCancelled).toEqual(true);

    // // Confirm open make order has been removed
    // await send(
      // trading,
      // 'updateAndGetQuantityBeingTraded',
      // [mln.options.address],
      // managerTxOpts
    // );

    // const isInOpenMakeOrder = await call(
      // trading,
      // 'isInOpenMakeOrder',
      // [mln.options.address]
    // );
    // expect(isInOpenMakeOrder).toEqual(false);
  // });
// });

// TODO - Expired order
>>>>>>> refactor: test encoding and decoding takeOrder's parameters
