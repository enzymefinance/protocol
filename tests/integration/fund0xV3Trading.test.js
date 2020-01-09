/*
 * @file Tests funds trading via the 0x adapter
 *
 * @test Fund takes an order made by a third party
 * @test Fund takes an order made by a third party, with a taker fee
 * @test Fund takes an order made by a third party, with same taker, taker fee, and protocol fee assets
 * @test Fund makes an order, taken by third party
 * @test Fund makes an order, with a maker and taker fee, taken by a third party
 * @test Fund makes an order, with same maker and maker fee asset, taken by a third party
 * @test Fund can cancel order with the orderId
 * @test Fund takes an order made by a third party, with no protocolFee set
 * @test TODO: order expiry?
 * @test TODO: Fund with no WETH cannot take orders?
 */

import { assetDataUtils, orderHashUtils } from '@0x/order-utils';
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime, mine } from '~/tests/utils/rpc';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder
} from '~/tests/utils/zeroExV3';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let dai, mln, weth, priceSource, version, zeroExExchange, erc20Proxy, fund, zeroExAdapter;
let exchangeIndex;
let makeOrderSignature, takeOrderSignature, cancelOrderSignature;
let protocolFeeAmount, protocolFeeCollector, chainId;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  const gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );
  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );
  cancelOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'cancelOrder',
  )

  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;
  version = contracts.Version;
  zeroExExchange = contracts.ZeroExV3Exchange;
  zeroExAdapter = contracts.ZeroExV3Adapter;
  erc20Proxy = contracts.ZeroExV3ERC20Proxy;

  // Seed manager with ETH
  await send(weth, 'transfer', [manager, toWei('20', 'ether')], defaultTxOpts);

  // Spin up fund for manager
  const fundName = stringToBytes('Test fund', 32);
  await version.methods
    .beginSetup(
      fundName,
      [],
      [],
      [],
      [zeroExExchange.options.address],
      [zeroExAdapter.options.address],
      weth.options.address,
      [
        mln.options.address,
        weth.options.address
      ]
    )
    .send(managerTxOpts);
  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(hubAddress);

  // Invest in fund
  await weth.methods
    .transfer(investor, toWei('6', 'ether'))
    .send(defaultTxOpts);
  const offeredValue = toWei('5', 'ether');
  const wantedShares = toWei('5', 'ether');
  const amguAmount = toWei('.01', 'ether');
  await weth.methods
    .approve(fund.participation.options.address, offeredValue)
    .send(investorTxOpts);
  await fund.participation.methods
    .requestInvestment(
      offeredValue,
      wantedShares,
      weth.options.address,
    ).send({ ...investorTxOpts, value: amguAmount });
  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);

  // Get 0x exchangeIndex
  const exchangeInfo = await call(fund.trading, 'getExchangeInfo');
  exchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === zeroExAdapter.options.address.toLowerCase(),
  );

  // Set vars - orders
  const protocolFeeMultiplier = new BN(
    await call(zeroExExchange, 'protocolFeeMultiplier')
  );
  protocolFeeAmount = protocolFeeMultiplier.mul(new BN(gasPrice)).toString();
  protocolFeeCollector = await call(zeroExExchange, 'protocolFeeCollector');
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
    const { trading } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnFund = new BN(await call(mln, 'balanceOf', [fund.vault.options.address]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethVault = new BN(await call(weth, 'balanceOf', [fund.vault.options.address]));

    await send(trading, 'callOnExchange', [
      exchangeIndex,
      takeOrderSignature,
      [
        signedOrder.makerAddress,
        signedOrder.takerAddress,
        mln.options.address,
        weth.options.address,
        signedOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        makerFeeAsset,
        takerFeeAsset
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
      [
        signedOrder.makerAssetData,
        signedOrder.takerAssetData,
        signedOrder.makerFeeAssetData,
        signedOrder.takerFeeAssetData
      ],
      '0x0',
      signedOrder.signature,
    ], managerTxOpts);

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnFund = new BN(await call(mln, 'balanceOf', [fund.vault.options.address]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethVault = new BN(await call(weth, 'balanceOf', [fund.vault.options.address]));
    const heldInExchange = new BN(
      await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    );

    expect(heldInExchange).bigNumberEq(new BN(0));
    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethVault).bigNumberEq(
      preWethVault
        .sub(new BN(signedOrder.takerAssetAmount))
        .sub(new BN(protocolFeeAmount))
    );
    expect(postMlnFund).bigNumberEq(preMlnFund.add(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
  });
})

describe('Fund takes an order with a taker fee', () => {
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

  test('Fund with enough taker fee asset takes order', async () => {
    const { trading, vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));

    const callOnExchangeArgs = [
      exchangeIndex,
      takeOrderSignature,
      [
        signedOrder.makerAddress,
        signedOrder.takerAddress,
        mln.options.address,
        weth.options.address,
        signedOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        makerFeeAsset,
        takerFeeAsset
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
      [
        signedOrder.makerAssetData,
        signedOrder.takerAssetData,
        signedOrder.makerFeeAssetData,
        signedOrder.takerFeeAssetData
      ],
      '0x0',
      signedOrder.signature,
    ];

    await expect(
      send(
        trading,
        'callOnExchange',
        callOnExchangeArgs,
        managerTxOpts
      )
    ).rejects.toThrow("Insufficient balance: takerFeeAsset");

    // Send dai to vault and re-try
    await send(dai, 'transfer', [vault.options.address, signedOrder.takerFee], defaultTxOpts);
    const preDaiVault = new BN(await call(dai, 'balanceOf', [vault.options.address]));

    await send(
      trading,
      'callOnExchange',
      callOnExchangeArgs,
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postDaiVault = new BN(await call(dai, 'balanceOf', [vault.options.address]));
    const heldInExchange = new BN(
      await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    );

    expect(heldInExchange).bigNumberEq(new BN(0));
    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethVault).bigNumberEq(
      preWethVault.sub(new BN(signedOrder.takerAssetAmount)).sub(new BN(protocolFeeAmount))
    );
    expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
    expect(postDaiVault).bigNumberEq(preDaiVault.sub(new BN(signedOrder.takerFee)));
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
    const { trading, vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        [
          signedOrder.makerAddress,
          signedOrder.takerAddress,
          mln.options.address,
          weth.options.address,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          makerFeeAsset,
          takerFeeAsset
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
        [
          signedOrder.makerAssetData,
          signedOrder.takerAssetData,
          signedOrder.makerFeeAssetData,
          signedOrder.takerFeeAssetData
        ],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const heldInExchange = new BN(
      await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    );

    expect(heldInExchange).bigNumberEq(new BN(0));
    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));

    expect(postWethVault).bigNumberEq(
      preWethVault.sub(new BN(signedOrder.takerAssetAmount))
        .sub(new BN(signedOrder.takerFee))
        .sub(new BN(protocolFeeAmount))
    );
    expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
  });
});

describe('Fund makes an order (no maker/taker fees)', () => {
  let signedOrder;

  test('Fund makes an order', async () => {
    const { trading } = fund;

    const makerAddress = trading.options.address;
    const makerTokenAddress = weth.options.address;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerTokenAddress = mln.options.address;
    const takerAssetAmount = toWei('0.5', 'ether');

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
    signedOrder = await signZeroExOrder(unsignedOrder, manager);

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        makeOrderSignature,
        [
          signedOrder.makerAddress,
          signedOrder.takerAddress,
          makerTokenAddress,
          takerTokenAddress,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          makerFeeAsset,
          takerFeeAsset
        ],
        [
          signedOrder.makerAssetAmount,
          signedOrder.takerAssetAmount,
          signedOrder.makerFee,
          signedOrder.takerFee,
          signedOrder.expirationTimeSeconds,
          signedOrder.salt,
          0,
          0,
        ],
        [
          signedOrder.makerAssetData,
          signedOrder.takerAssetData,
          signedOrder.makerFeeAssetData,
          signedOrder.takerFeeAssetData
        ],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );
    const makerAssetAllowance = new BN(
      await call(weth, 'allowance', [makerAddress, erc20Proxy.options.address])
    )
    expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });

  test('Third party takes the order made and accounting updated', async () => {
    const { accounting, trading } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    await send(mln, 'approve', [erc20Proxy.options.address, signedOrder.takerAssetAmount], defaultTxOpts);
    await send(weth, 'approve', [protocolFeeCollector, protocolFeeAmount], defaultTxOpts);
    await send(
      zeroExExchange,
      'fillOrder',
      [
        signedOrder,
        signedOrder.takerAssetAmount,
        signedOrder.signature
      ],
      defaultTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    // Update accounting so maker asset is no longer marked as in an open order
    await send(trading, 'updateAndGetQuantityBeingTraded', [weth.options.address], managerTxOpts);

    const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [weth.options.address]);
    expect(isInOpenMakeOrder).toEqual(false);

    // Increment next block time past the maker asset cooldown period
    const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
    await increaseTime(Number(cooldownTime)+1);
    await mine();

    expect(postMlnFundHoldings).bigNumberEq(
      preMlnFundHoldings.add(new BN(signedOrder.takerAssetAmount))
    );
    expect(postWethFundHoldings).bigNumberEq(
      preWethFundHoldings.sub(new BN(signedOrder.makerAssetAmount))
    );
    expect(postMlnDeployer).bigNumberEq(
      preMlnDeployer.sub(new BN(signedOrder.takerAssetAmount))
    );
    expect(postWethDeployer).bigNumberEq(
      preWethDeployer.add(new BN(signedOrder.makerAssetAmount).sub(new BN(protocolFeeAmount)))
    );
  });
});

describe('Fund makes an order with a maker and taker fee', () => {
  let signedOrder;

  test('Fund makes an order', async () => {
    const { trading, vault } = fund;

    const makerAddress = trading.options.address;
    const makerTokenAddress = weth.options.address;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerTokenAddress = mln.options.address;
    const takerAssetAmount = toWei('0.5', 'ether');

    const makerFee = new BN(toWei('1', 'ether'));
    const makerFeeTokenAddress = dai.options.address;
    const takerFee = new BN(toWei('1', 'ether'));
    const takerFeeTokenAddress = dai.options.address;
    const feeRecipientAddress = investor;

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        makerFee,
        makerFeeTokenAddress,
        takerTokenAddress,
        takerAssetAmount,
        takerFee,
        takerFeeTokenAddress,
        feeRecipientAddress
      },
    );
    signedOrder = await signZeroExOrder(unsignedOrder, manager);

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const callOnExchangeArgs = [
      exchangeIndex,
      makeOrderSignature,
      [
        signedOrder.makerAddress,
        signedOrder.takerAddress,
        makerTokenAddress,
        takerTokenAddress,
        signedOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        makerFeeAsset,
        takerFeeAsset
      ],
      [
        signedOrder.makerAssetAmount,
        signedOrder.takerAssetAmount,
        signedOrder.makerFee,
        signedOrder.takerFee,
        signedOrder.expirationTimeSeconds,
        signedOrder.salt,
        0,
        0,
      ],
      [
        signedOrder.makerAssetData,
        signedOrder.takerAssetData,
        signedOrder.makerFeeAssetData,
        signedOrder.takerFeeAssetData
      ],
      '0x0',
      signedOrder.signature
    ];

    await expect(
      send(trading, 'callOnExchange', callOnExchangeArgs, managerTxOpts)
    ).rejects.toThrow("Insufficient balance: makerFeeAsset");

    // Send dai to vault and re-try
    await send(dai, 'transfer', [vault.options.address, signedOrder.takerFee], defaultTxOpts);
    await send(trading, 'callOnExchange', callOnExchangeArgs, managerTxOpts)

    const makerAssetAllowance = new BN(
      await call(weth, 'allowance', [makerAddress, erc20Proxy.options.address])
    )
    const makerFeeAssetAllowance = new BN(
      await call(dai, 'allowance', [makerAddress, erc20Proxy.options.address])
    )
    expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
    expect(makerFeeAssetAllowance).bigNumberEq(new BN(signedOrder.makerFee));
  });

  test('Third party takes the order and accounting updated', async () => {
    const { accounting, trading } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    await send(mln, 'approve', [erc20Proxy.options.address, signedOrder.takerAssetAmount], defaultTxOpts);
    await send(weth, 'approve', [protocolFeeCollector, protocolFeeAmount], defaultTxOpts);
    await send(dai, 'approve', [erc20Proxy.options.address, signedOrder.takerFee], defaultTxOpts);

    await send(
      zeroExExchange,
      'fillOrder',
      [
        signedOrder,
        signedOrder.takerAssetAmount,
        signedOrder.signature
      ],
      defaultTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    // Update accounting so maker asset is no longer marked as in an open order
    await send(trading, 'updateAndGetQuantityBeingTraded', [weth.options.address], managerTxOpts);

    const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [weth.options.address]);
    expect(isInOpenMakeOrder).toEqual(false);

    // Increment next block time past the maker asset cooldown period
    const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
    await increaseTime(Number(cooldownTime)+1);
    await mine();

    expect(postMlnFundHoldings).bigNumberEq(
      preMlnFundHoldings.add(new BN(signedOrder.takerAssetAmount))
    );
    expect(postWethFundHoldings).bigNumberEq(
      preWethFundHoldings.sub(new BN(signedOrder.makerAssetAmount))
    );
    expect(postMlnDeployer).bigNumberEq(
      preMlnDeployer.sub(new BN(signedOrder.takerAssetAmount))
    );
    expect(postWethDeployer).bigNumberEq(
      preWethDeployer.add(new BN(signedOrder.makerAssetAmount).sub(new BN(protocolFeeAmount)))
    );
  });
});

describe('Fund makes an order with same makere asset and maker fee asset', () => {
  let signedOrder;

  test('Fund makes an order', async () => {
    const { trading, vault } = fund;

    const makerAddress = trading.options.address;
    const makerTokenAddress = weth.options.address;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerTokenAddress = mln.options.address;
    const takerAssetAmount = toWei('0.5', 'ether');

    const makerFee = new BN(toWei('0.005', 'ether'));
    const makerFeeTokenAddress = weth.options.address;
    const feeRecipientAddress = investor;

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      chainId,
      {
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        makerFee,
        makerFeeTokenAddress,
        takerTokenAddress,
        takerAssetAmount,
        feeRecipientAddress
      },
    );
    signedOrder = await signZeroExOrder(unsignedOrder, manager);

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        makeOrderSignature,
        [
          signedOrder.makerAddress,
          signedOrder.takerAddress,
          makerTokenAddress,
          takerTokenAddress,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          makerFeeAsset,
          takerFeeAsset
        ],
        [
          signedOrder.makerAssetAmount,
          signedOrder.takerAssetAmount,
          signedOrder.makerFee,
          signedOrder.takerFee,
          signedOrder.expirationTimeSeconds,
          signedOrder.salt,
          0,
          0,
        ],
        [
          signedOrder.makerAssetData,
          signedOrder.takerAssetData,
          signedOrder.makerFeeAssetData,
          signedOrder.takerFeeAssetData
        ],
        '0x0',
        signedOrder.signature
      ],
      managerTxOpts
    );

    const makerAssetAllowance = new BN(
      await call(weth, 'allowance', [makerAddress, erc20Proxy.options.address])
    );
    expect(makerAssetAllowance).bigNumberEq(
      new BN(signedOrder.makerAssetAmount).add(new BN(signedOrder.makerFee))
    );
  });

  test('Third party takes the order and accounting updated', async () => {
    const { accounting, trading } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    await send(mln, 'approve', [erc20Proxy.options.address, signedOrder.takerAssetAmount], defaultTxOpts);
    await send(weth, 'approve', [protocolFeeCollector, protocolFeeAmount], defaultTxOpts);
    await send(
      zeroExExchange,
      'fillOrder',
      [
        signedOrder,
        signedOrder.takerAssetAmount,
        signedOrder.signature
      ],
      defaultTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    // Update accounting so maker asset is no longer marked as in an open order
    await send(trading, 'updateAndGetQuantityBeingTraded', [weth.options.address], managerTxOpts);

    const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [weth.options.address]);
    expect(isInOpenMakeOrder).toEqual(false);

    // Increment next block time past the maker asset cooldown period
    const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
    await increaseTime(Number(cooldownTime)+1);
    await mine();

    expect(postMlnFundHoldings).bigNumberEq(
      preMlnFundHoldings.add(new BN(signedOrder.takerAssetAmount))
    );
    expect(postWethFundHoldings).bigNumberEq(
      preWethFundHoldings.sub(new BN(signedOrder.makerAssetAmount))
        .sub(new BN(signedOrder.makerFee))
    );
    expect(postMlnDeployer).bigNumberEq(
      preMlnDeployer.sub(new BN(signedOrder.takerAssetAmount))
    );
    expect(postWethDeployer).bigNumberEq(
      preWethDeployer.add(new BN(signedOrder.makerAssetAmount).sub(new BN(protocolFeeAmount)))
    );
  });
});

describe('Fund can cancel an order with only the orderId', () => {
  let signedOrder;

  test('Fund makes an order', async () => {
    const { trading } = fund;

    const makerAddress = trading.options.address;
    const makerTokenAddress = weth.options.address;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerTokenAddress = mln.options.address;
    const takerAssetAmount = toWei('0.5', 'ether');

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
    signedOrder = await signZeroExOrder(unsignedOrder, manager);

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        makeOrderSignature,
        [
          signedOrder.makerAddress,
          signedOrder.takerAddress,
          makerTokenAddress,
          takerTokenAddress,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          makerFeeAsset,
          takerFeeAsset
        ],
        [
          signedOrder.makerAssetAmount,
          signedOrder.takerAssetAmount,
          signedOrder.makerFee,
          signedOrder.takerFee,
          signedOrder.expirationTimeSeconds,
          signedOrder.salt,
          0,
          0,
        ],
        [
          signedOrder.makerAssetData,
          signedOrder.takerAssetData,
          signedOrder.makerFeeAssetData,
          signedOrder.takerFeeAssetData
        ],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );
    const makerAssetAllowance = new BN(
      await call(weth, 'allowance', [makerAddress, erc20Proxy.options.address])
    )
    expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });

  test('Fund cancels the order', async () => {
    const { trading } = fund;

    const orderHashHex = await orderHashUtils.getOrderHashAsync(signedOrder);
    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        cancelOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        ['0x', '0x', '0x', '0x'],
        orderHashHex,
        '0x0',
      ],
      managerTxOpts
    );
    const isOrderCancelled = await call(zeroExExchange, 'cancelled', [orderHashHex]);

    const makerAssetAllowance = new BN(
      await call(weth, 'allowance', [trading.options.address, erc20Proxy.options.address])
    );

    expect(makerAssetAllowance).bigNumberEq(new BN(0));
    expect(isOrderCancelled).toBeTruthy();

    // Confirm open make order has been removed
    await send(
      trading,
      'updateAndGetQuantityBeingTraded',
      [weth.options.address],
      managerTxOpts
    );
    const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [weth.options.address])

    expect(isInOpenMakeOrder).toBeFalsy();
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
    const fillQuantity = signedOrder.takerAssetAmount;

    const makerFeeAsset = signedOrder.makerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.makerFeeAssetData).tokenAddress;
    const takerFeeAsset = signedOrder.takerFeeAssetData === '0x' ?
      EMPTY_ADDRESS :
      assetDataUtils.decodeERC20AssetData(signedOrder.takerFeeAssetData).tokenAddress;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnFund = new BN(await call(accounting, 'assetHoldings', [mln.options.address]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethFund = new BN(await call(accounting, 'assetHoldings', [weth.options.address]));

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        [
          signedOrder.makerAddress,
          signedOrder.takerAddress,
          mln.options.address,
          weth.options.address,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          makerFeeAsset,
          takerFeeAsset
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
        [
          signedOrder.makerAssetData,
          signedOrder.takerAssetData,
          signedOrder.makerFeeAssetData,
          signedOrder.takerFeeAssetData
        ],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnFund = new BN(await call(accounting, 'assetHoldings', [mln.options.address]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethFund = new BN(await call(accounting, 'assetHoldings', [weth.options.address]));
    const heldInExchange = new BN(
      await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    );

    expect(heldInExchange).bigNumberEq(new BN(0));
    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethFund).bigNumberEq(
      preWethFund.sub(new BN(signedOrder.takerAssetAmount))
    );
    expect(postMlnFund).bigNumberEq(preMlnFund.add(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
  });
});
