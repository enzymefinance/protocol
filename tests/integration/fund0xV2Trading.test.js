/*
 * @file Tests funds vault via the 0x adapter
 *
 * @test Fund takes an order
 * @test Fund takes an order with a taker fee
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';
import { getDeployed } from '~/tests/utils/getDeployed';
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let mln, zrx, weth, erc20Proxy, zeroExAdapter, zeroExExchange;
let fund;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ZRX, web3, mainnetAddrs.tokens.ZRX);
  erc20Proxy = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ERC20_PROXY, web3, mainnetAddrs.zeroExV2.ZeroExV2ERC20Proxy);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ADAPTER, web3);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE_INTERFACE, web3, mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  fund = await setupFundWithParams({
    integrationAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });
});

describe('Fund takes an order', () => {
  let signedOrder;

  test('Third party makes and validates an off-chain order', async () => {
    const makerAddress = deployer;
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress,
        makerTokenAddress: zrx.options.address,
        makerAssetAmount,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      },
    );

    await send(zrx, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
    signedOrder = await signZeroExOrder(unsignedOrder, deployer);
    const signatureValid = await isValidZeroExSignatureOffChain(
      unsignedOrder,
      signedOrder.signature,
      deployer
    );

    expect(signatureValid).toBeTruthy();
  });

  test('Manager takes order through adapter', async () => {
    const { vault } = fund;
    const fillQuantity = signedOrder.takerAssetAmount;

    const preMlnDeployer = new BN(await call(zrx, 'balanceOf', [deployer]));
    const preWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
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
      web3
    );

    const postMlnDeployer = new BN(await call(zrx, 'balanceOf', [deployer]));
    const postWethDeployer = new BN(await call(weth, 'balanceOf', [deployer]));
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(zrx, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [zrx.options.address])
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

  test('Third party makes and validates an off-chain order', async () => {
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

    await send(mln, 'approve', [erc20Proxy.options.address, makerAssetAmount], defaultTxOpts, web3);
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
      web3
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
