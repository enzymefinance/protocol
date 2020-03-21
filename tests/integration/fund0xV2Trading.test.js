/*
 * @file Tests funds vault via the 0x adapter
 *
 * @test Fund takes an order
 * @test Fund takes an order with a taker fee
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let mln, zrx, weth, erc20Proxy, priceSource, zeroExAdapter, zeroExExchange;
let fund;
let takeOrderSignature;
let mlnToEthRate, wethToEthRate, zrxToEthRate;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  zrx = contracts.ZRX;
  weth = contracts.WETH;
  erc20Proxy = contracts.ZeroExV2ERC20Proxy;
  priceSource = contracts.TestingPriceFeed;
  zeroExAdapter = contracts.ZeroExV2Adapter;
  zeroExExchange = contracts.ZeroExV2Exchange;

  const fundFactory = contracts.FundFactory;

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
    integrationAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
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
    const { vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
    );

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await send(
      vault,
      'callOnIntegration',
      [
        zeroExAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
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
    const makerAddress = deployer;
    const takerFee = new BN(toWei('0.0001', 'ether'));

    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        feeRecipientAddress: investor,
        makerAddress,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerFee,
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

  test('Invest in fund with enough ZRX to take trade with taker fee', async () => {
    const { hub, shares } = fund;

    // Enable investment with zrx
    await send(shares, 'enableSharesInvestmentAssets', [[zrx.options.address]], managerTxOpts);

    const contribAmount = toWei('1', 'ether');
    const shareCost = new BN(
      await call(
        shares,
        'getSharesCostInAsset',
        [toWei('1', 'ether'), zrx.options.address]
      )
    );
    const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount,
        investor,
        tokenContract: zrx
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses: [zrx.options.address],
        tokenPrices: [zrxToEthRate]
      }
    });

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(preInvestorShares.add(wantedShares));
  });

  test('fund with enough ZRX takes order', async () => {
    const { vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
    );
    const preFundHoldingsZrx = new BN(
      await call(vault, 'assetBalances', [zrx.options.address])
    );

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await send(
      vault,
      'callOnIntegration',
      [
        zeroExAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfZrx = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
    );
    const postFundHoldingsZrx = new BN(
      await call(vault, 'assetBalances', [zrx.options.address])
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
