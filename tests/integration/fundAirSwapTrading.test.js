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
let airSwapAdapter;
let mln, weth, swapContract;
let fund;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts =  { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = contracts.MLN;
  weth = contracts.WETH;
  swapContract = contracts.Swap;
  orders.setVerifyingContract(swapContract.options.address);

  const fundFactory = contracts.FundFactory;
  airSwapAdapter = contracts.AirSwapAdapter;

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
    integrationAdapters: [airSwapAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth,
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
  });
});

describe('Fund takes an order', () => {
  let signedOrder;

  test('manager takes order through adapter', async () => {
    const { vault } = fund;
    const makerAssetAmount = toWei('1', 'ether');
    const fillQuantity = toWei('0.05', 'ether');

    const unsignedOrder = await createUnsignedAirSwapOrder({
      signerWallet: deployer,
      signerToken: mln.options.address,
      signerTokenAmount: makerAssetAmount,
      senderWallet: vault.options.address,
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

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
    );

    await send(
      vault,
      'callOnIntegration',
      [
        airSwapAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
    );

    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
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

