/*
 * @file Tests funds vault via the 0x adapter
 *
 * @test Fund takes an order made by a third party
 * @test Fund takes an order made by a third party, with a taker fee
 * @test Fund takes an order made by a third party, with same taker, taker fee, and protocol fee assets
 * @test Fund takes an order made by a third party, with no protocolFee set
 */

import { assetDataUtils } from '@0x/order-utils';
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import getAccounts from '~/deploy/utils/getAccounts';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  signZeroExOrder
} from '~/tests/utils/zeroExV3';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts;
let dai, mln, weth, priceSource, fundFactory, zeroExExchange, erc20Proxy, fund, zeroExAdapter;
let exchangeIndex;
let takeOrderSignature;
let protocolFeeAmount, chainId;
let mlnToEthRate, wethToEthRate, daiToEthRate;

beforeAll(async () => {
  const gasPrice = toWei('2', 'gwei');
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;
  fundFactory = contracts.FundFactory;
  zeroExExchange = contracts.ZeroExV3Exchange;
  zeroExAdapter = contracts.ZeroExV3Adapter;
  erc20Proxy = contracts.ZeroExV3ERC20Proxy;

  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  daiToEthRate = toWei('0.25', 'ether');
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
    exchanges: [zeroExExchange.options.address],
    exchangeAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('5', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });

  // Get 0x exchangeIndex
  const exchangeInfo = await call(fund.vault, 'getExchangeInfo');
  exchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === zeroExAdapter.options.address.toLowerCase(),
  );

  // Set vars - orders
  const protocolFeeMultiplier = new BN(
    await call(zeroExExchange, 'protocolFeeMultiplier')
  );
  protocolFeeAmount = protocolFeeMultiplier.mul(new BN(gasPrice)).toString();
  chainId = await web3.eth.net.getId();
});

describe('Fund takes an order', () => {
  let signedOrder;

  test('Third party makes an order', async () => {
    const makerAddress = deployer;
    const makerTokenAddress = mln.options.address;
    const makerAssetAmount = toWei('1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const wethToTakerAssetRate = new BN(
      (await call(priceSource, 'getPrice', [takerTokenAddress]))[0]
    );
    const takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      wethToTakerAssetRate
    ).toString();

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
      },
    );

    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);

    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Manager takes order through 0x adapter', async () => {
    const { accounting, vault } = fund;

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    const fillQuantity = signedOrder.takerAssetAmount;
    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await send(
      vault,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        '0x0',
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));

    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(
      new BN(signedOrder.takerAssetAmount).add(new BN(protocolFeeAmount))
    );
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });
});

describe('Fund takes an order with a different taker fee asset', () => {
  let signedOrder;

  test('Third party makes an order', async () => {
    const makerAddress = deployer;
    const makerTokenAddress = mln.options.address;
    const makerAssetAmount = toWei('1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const wethToTakerAssetRate = new BN(
      (await call(priceSource, 'getPrice', [takerTokenAddress]))[0]
    );
    const takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      wethToTakerAssetRate
    ).toString();

    const takerFee = new BN(toWei('1', 'ether'));
    const takerFeeTokenAddress = dai.options.address;
    const feeRecipientAddress = investor;

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        feeRecipientAddress,
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        takerFee,
        takerTokenAddress,
        takerAssetAmount,
        takerFeeTokenAddress
      },
    );

    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Fund WITHOUT enough taker fee fails to take order', async () => {
    const { vault } = fund;

    const fillQuantity = signedOrder.takerAssetAmount;
    const orderAddresses = [];
    const orderValues = [];
    const orderData = [];

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs,
        ],
        managerTxOpts,
      )
    ).rejects.toThrowFlexible("TRANSFER_FAILED");
  });

  test('Invest in fund with enough DAI to take trade with taker fee', async () => {
    const { accounting, hub, shares } = fund;

    // Enable investment with dai
    await send(shares, 'enableSharesInvestmentAssets', [[dai.options.address]], managerTxOpts);

    const contribAmount = toWei('100', 'ether');
    const shareCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [toWei('1', 'ether'), dai.options.address]
      )
    );
    const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount,
        investor,
        tokenContract: dai
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses: [dai.options.address],
        tokenPrices: [daiToEthRate]
      }
    });

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(preInvestorShares.add(new BN(wantedShares)));
  });

  test('Fund with enough taker fee asset takes order', async () => {
    const { accounting, vault } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfDai = new BN(await call(dai, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsDai = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [dai.options.address])
    );
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    const fillQuantity = signedOrder.takerAssetAmount;

    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await send(
      vault,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        '0x0',
        encodedArgs,
      ],
      managerTxOpts,
    );


    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfDai = new BN(await call(dai, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsDai = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [dai.options.address])
    );
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));

    const fundHoldingsDaiDiff = preFundHoldingsDai.sub(postFundHoldingsDai);
    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);
    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
    expect(fundHoldingsDaiDiff).bigNumberEq(preFundBalanceOfDai.sub(postFundBalanceOfDai));
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(
      new BN(signedOrder.takerAssetAmount).add(new BN(protocolFeeAmount))
    );
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(signedOrder.makerAssetAmount));
    expect(fundHoldingsDaiDiff).bigNumberEq(new BN(signedOrder.takerFee));
  });
});

describe('Fund takes an order with same taker, taker fee, and protocol fee asset', () => {
  let signedOrder;

  test('Third party makes an order', async () => {
    const makerAddress = deployer;
    const makerTokenAddress = mln.options.address;
    const makerAssetAmount = toWei('0.5', 'Ether');
    const takerTokenAddress = weth.options.address;
    const wethToTakerAssetRate = new BN(
      (await call(priceSource, 'getPrice', [takerTokenAddress]))[0]
    );
    const takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      wethToTakerAssetRate
    ).toString();

    const takerFee = new BN(toWei('0.005', 'ether'));
    const takerFeeTokenAddress = weth.options.address;
    const feeRecipientAddress = investor;

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        feeRecipientAddress,
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
        takerFee,
        takerFeeTokenAddress
      },
    );

    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Fund with enough taker fee asset and protocol fee takes order', async () => {
    const { accounting, trading } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    const fillQuantity = signedOrder.takerAssetAmount;
    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await send(
      vault,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        '0x0',
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));

    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);
    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(
      new BN(signedOrder.takerAssetAmount)
        .add(new BN(protocolFeeAmount))
        .add(new BN(signedOrder.takerFee))
    );
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });
});

describe('Fund can take an order when protocol fee disabled', () => {
  let signedOrder;

  // @dev Sets protocolFeeMultiplier to 0, so need to undo after if further tests
  test('Deployer sets protocolFeeMultiplier to 0', async () => {
    await send(zeroExExchange, 'setProtocolFeeMultiplier', [0], defaultTxOpts);
    const newProtocolFeeMultiplier = await call(zeroExExchange, 'protocolFeeMultiplier');
    expect(newProtocolFeeMultiplier).toEqual("0");
  });

  test('Third party makes order', async () => {
    const makerAddress = deployer;
    const makerTokenAddress = mln.options.address;
    const makerAssetAmount = toWei('1', 'Ether');
    const takerTokenAddress = weth.options.address;
    const wethToTakerAssetRate = new BN(
      (await call(priceSource, 'getPrice', [takerTokenAddress]))[0]
    );
    const takerAssetAmount = BNExpDiv(
      new BN(makerAssetAmount),
      wethToTakerAssetRate
    ).toString();

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
      },
    );

    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts);

    signedOrder = await signZeroExOrder(unsignedOrder, deployer);

    const signatureValid = await call(
      zeroExExchange,
      'isValidOrderSignature',
      [signedOrder, signedOrder.signature]
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Manager takes order through 0x adapter', async () => {
    const { accounting, trading } = fund;

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    const fillQuantity = signedOrder.takerAssetAmount;
    const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

    await send(
      vault,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        '0x0',
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));

    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);
    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(
      new BN(signedOrder.takerAssetAmount).add(new BN(signedOrder.takerFee))
    );
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });
});
