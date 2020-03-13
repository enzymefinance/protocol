const { orders } = require('@airswap/order-utils');
const { ERC20_INTERFACE_ID } = require('@airswap/order-utils').constants;
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { getFunctionSignature } from '~/tests/utils/metadata';
import getAccounts from '~/deploy/utils/getAccounts';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { setupFundWithParams } from '~/tests/utils/fund';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import {
  createUnsignedAirSwapOrder,
  signAirSwapOrder,
  encodeAirSwapTakeOrderArgs
} from '~/tests/utils/airSwap';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let mln, weth, swapContract;
let fund;
let takeOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts =  { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  weth = contracts.WETH;
  swapContract = contracts.Swap;
  orders.setVerifyingContract(swapContract.options.address);

  const version = contracts.Version;
  const airSwapAdapter = contracts.AirSwapAdapter;

  const erc20TransferHandler = contracts.ERC20TransferHandler;
  const transferHandlerRegistry = contracts.TransferHandlerRegistry;
  await send(
    transferHandlerRegistry,
    'addTransferHandler',
    [
      ERC20_INTERFACE_ID,
      erc20TransferHandler.options.address,
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [swapContract.options.address],
    exchangeAdapters: [airSwapAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth,
    },
    manager,
    quoteToken: weth.options.address,
    version,
  });

  exchangeIndex = 0;
});

describe('Fund takes an order', () => {
  let signedOrder;

  test('manager takes order through adapter', async () => {
    const { trading, accounting} = fund;
    const makerAssetAmount = toWei('1', 'ether');
    const fillQuantity = toWei('0.05', 'ether');

    const unsignedOrder = await createUnsignedAirSwapOrder({
      signerWallet: deployer,
      signerToken: mln.options.address,
      signerTokenAmount: makerAssetAmount,
      senderWallet: trading.options.address,
      senderToken: weth.options.address,
      senderTokenAmount: fillQuantity,
    });

    signedOrder = await signAirSwapOrder(unsignedOrder, swapContract.options.address, deployer);

    const encodedArgs = encodeAirSwapTakeOrderArgs(signedOrder);

    await send(
      mln,
      'approve',
      [swapContract.options.address, makerAssetAmount],
      defaultTxOpts,
    );

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderSignature,
        '0x0',
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );

    const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
    const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);

    // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal
    expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
    expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));

    // Confirm that expected asset amounts were filled
    expect(fundHoldingsWethDiff).bigNumberEq(new BN(fillQuantity));
    expect(fundHoldingsMlnDiff).bigNumberEq(new BN(makerAssetAmount));
  });
});

