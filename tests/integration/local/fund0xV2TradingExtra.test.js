/*
 * @file Tests funds trading via the 0x adapter
 * @dev This file is intended only for tests that will not work on a testnet (e.g., increaseTime)
 *
 * @test Fund makes 2nd order with same maker asset as 1st order
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime, mine } from '~/tests/utils/rpc';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let mln, weth, erc20Proxy, zeroExExchange;
let fund;
let exchangeIndex;
let makeOrderSignature;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  mln = contracts.MLN;
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
  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );
});

describe('Fund makes 2nd order with same maker asset as 1st order', () => {
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

    // Increment next block time past the maker asset cooldown period
    const cooldownTime = await trading.methods.MAKE_ORDER_COOLDOWN().call();
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
      preWethDeployer.add(new BN(signedOrder.makerAssetAmount))
    );
  });

  test('Make another order through the fund, with the same maker asset', async () => {
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
});
