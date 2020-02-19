/*
 * @file Tests funds trading via the 0x adapter
 *
 * @test Fund takes an order
 * @test Fund takes an order with a taker fee
 * @test Fund makes an order, taken by third party
 * @test Fund makes an order, cancelled with the orderId
 */

import { orderHashUtils } from '@0x/order-utils-v2';
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let mln, zrx, weth, erc20Proxy, zeroExExchange;
let fund;
let makeOrderSignature, takeOrderSignature, cancelOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

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

  mln = contracts.MLN;
  zrx = contracts.ZRX;
  weth = contracts.WETH;
  erc20Proxy = contracts.ZeroExV2ERC20Proxy;
  zeroExExchange = contracts.ZeroExV2Exchange;

  const version = contracts.Version;
  const zeroExAdapter = contracts.ZeroExV2Adapter;

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

  // Seed fund with enough ZRX for fees
  await send(
    zrx,
    'transfer',
    [fund.vault.options.address, toWei('10', 'ether')],
    defaultTxOpts
  );
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
    const { trading, vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

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

  test('fund with enough ZRX takes order', async () => {
    const { trading, vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preZrxVault = new BN(await call(zrx, 'balanceOf', [vault.options.address]));

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
        signedOrder.signature
      ],
      managerTxOpts
    );

    const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postZrxVault = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const postWethHeldInExchange = new BN(
      await call(trading, 'updateAndGetQuantityHeldInExchange', [weth.options.address])
    );

    expect(postWethHeldInExchange).bigNumberEq(new BN(0));
    expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(signedOrder.makerAssetAmount)));
    expect(postWethVault).bigNumberEq(preWethVault.sub(new BN(signedOrder.takerAssetAmount)));
    expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(signedOrder.makerAssetAmount)));
    expect(postWethDeployer).bigNumberEq(preWethDeployer.add(new BN(signedOrder.takerAssetAmount)));
    expect(postZrxVault).bigNumberEq(preZrxVault.sub(new BN(signedOrder.takerFee)));
  });
});

describe('Fund makes an order', () => {
  let signedOrder;

  test('Make order through the fund', async () => {
    const { trading } = fund;

    const makerAddress = trading.options.address;
    const makerTokenAddress = weth.options.address;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerTokenAddress = mln.options.address;
    const takerAssetAmount = toWei('0.5', 'ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
      },
    );
    signedOrder = await signZeroExOrder(unsignedOrder, manager);

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        makeOrderSignature,
        [
          makerAddress,
          EMPTY_ADDRESS,
          makerTokenAddress,
          takerTokenAddress,
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
          0,
          0,
        ],
        [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );

    const makerAssetAllowance = new BN(
      await call(weth, 'allowance', [makerAddress, erc20Proxy.options.address])
    );
    expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });

  test('Third party takes the order made by the fund, and accounting is updated', async () => {
    const { accounting, trading } = fund;

    const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
    const preMlnFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [mln.options.address])
    );
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preWethFundHoldings = new BN(
      await call(accounting, 'assetHoldings', [weth.options.address])
    );

    await send(
      mln,
      'approve',
      [erc20Proxy.options.address, signedOrder.takerAssetAmount],
      defaultTxOpts
    );
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

    await send(
      trading,
      'updateAndGetQuantityBeingTraded',
      [weth.options.address],
      managerTxOpts
    );

    const isInOpenMakeOrder = await call(
      trading,
      'isInOpenMakeOrder',
      [weth.options.address]
    );
    expect(isInOpenMakeOrder).toEqual(false);

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
      preWethDeployer.add(new BN(signedOrder.makerAssetAmount))
    );
  });
});

describe('Fund cancels an order', () => {
  let signedOrder;
  let makerTokenAddress;

  test('Make order through the fund with different maker asset', async () => {
    const { trading } = fund;

    const makerAddress = trading.options.address;
    makerTokenAddress = mln.options.address;
    const makerAssetAmount = toWei('0.25', 'Ether');
    const takerTokenAddress = weth.options.address;
    const takerAssetAmount = toWei('0.025', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress,
        makerTokenAddress,
        makerAssetAmount,
        takerTokenAddress,
        takerAssetAmount,
      },
    );
    signedOrder = await signZeroExOrder(unsignedOrder, manager);

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        makeOrderSignature,
        [
          makerAddress,
          EMPTY_ADDRESS,
          makerTokenAddress,
          takerTokenAddress,
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
          0,
          0,
        ],
        [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        '0x0',
        signedOrder.signature,
      ],
      managerTxOpts
    );

    const makerAssetAllowance = new BN(
      await call(mln, 'allowance', [makerAddress, erc20Proxy.options.address])
    );
    expect(makerAssetAllowance).bigNumberEq(new BN(signedOrder.makerAssetAmount));
  });

  test('Fund can cancel the order', async () => {
    const { trading } = fund;

    const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        cancelOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          makerTokenAddress,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [signedOrder.makerAssetData, '0x0', '0x0', '0x0'],
        orderHashHex,
        '0x0',
      ],
      managerTxOpts
    );

    const isOrderCancelled = await call(zeroExExchange, 'cancelled', [orderHashHex]);
    const makerAssetAllowance = new BN(
      await call(mln, 'allowance', [trading.options.address, erc20Proxy.options.address])
    );

    expect(makerAssetAllowance).bigNumberEq(new BN(0));
    expect(isOrderCancelled).toEqual(true);

    // Confirm open make order has been removed
    await send(
      trading,
      'updateAndGetQuantityBeingTraded',
      [mln.options.address],
      managerTxOpts
    );

    const isInOpenMakeOrder = await call(
      trading,
      'isInOpenMakeOrder',
      [mln.options.address]
    );
    expect(isInOpenMakeOrder).toEqual(false);
  });
});
// TODO - Expired order
