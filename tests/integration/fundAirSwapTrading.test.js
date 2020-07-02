const { orders } = require('@airswap/order-utils');
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { getFunctionSignature } from '~/utils/metadata';
import { setupFundWithParams } from '~/utils/fund';
import { CONTRACT_NAMES } from '~/utils/constants';
import {
  createUnsignedAirSwapOrder,
  signAirSwapOrder,
  encodeAirSwapTakeOrderArgs
} from '~/utils/airSwap';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let airSwapAdapter;
let mln, weth, swapContract;
let fund;
let takeOrderSignature;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts =  { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);

  swapContract = getDeployed(CONTRACT_NAMES.AIR_SWAP_SWAP, web3, mainnetAddrs.airSwap.AirSwapSwap);

  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  airSwapAdapter = getDeployed(CONTRACT_NAMES.AIR_SWAP_ADAPTER, web3);

  fund = await setupFundWithParams({
    integrationAdapters: [airSwapAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth,
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
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
    }, web3);

    signedOrder = await signAirSwapOrder(unsignedOrder, swapContract.options.address, deployer);

    const encodedArgs = encodeAirSwapTakeOrderArgs(signedOrder, web3);

    await send(
      mln,
      'approve',
      [swapContract.options.address, makerAssetAmount],
      defaultTxOpts,
      web3
    );

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    await send(
      vault,
      'callOnIntegration',
      [
        airSwapAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts,
      web3
    );

    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
    const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

    // Confirm that expected asset amounts were filled
    expect(fundBalanceOfWethDiff).bigNumberEq(new BN(fillQuantity));
    expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerAssetAmount));
  });
});

