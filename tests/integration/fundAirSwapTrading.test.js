const { orders, signatures } = require('@airswap/order-utils');
const { GANACHE_PROVIDER, ERC20_INTERFACE_ID } = require('@airswap/order-utils').constants;
import { BN, toWei } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { call, send } from '~/deploy/utils/deploy-contract';
import { getFunctionSignature } from '~/tests/utils/metadata';
import getAccounts from '~/deploy/utils/getAccounts';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { setupFundWithParams } from '~/tests/utils/fund';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';

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
  let order;

  test('manager takes order through adapter', async () => {
    const { trading, accounting} = fund;
    const makerAssetAmount = toWei('1', 'ether');

    order = await orders.getOrder({
      signer: {
        wallet: deployer,
        token: mln.options.address,
        amount: makerAssetAmount,
      },
    });

    const latestBlock = await web3.eth.getBlock('latest');
    const duration = 24 * 60 * 60; // 1 day
    order.expiry = latestBlock.timestamp + duration;

    const fillQuantity = toWei('0.05', 'ether');

    order.sender.wallet = trading.options.address;
    order.sender.token = weth.options.address;
    order.sender.amount = fillQuantity;
    order.affiliate.kind = '0x0';

    order.signature = await signatures.getWeb3Signature(
      order,
      deployer,
      swapContract.options.address,
      GANACHE_PROVIDER,
    );

    expect(orders.isValidOrder(order)).toBe(true);

    const orderAddresses = [];
    const orderValues = [];
    const tokenKinds = [];
    const sigBytesComponents = [];

    orderAddresses[0] = order.signer.wallet;
    orderAddresses[1] = order.signer.token;
    orderAddresses[2] = order.sender.wallet;
    orderAddresses[3] = order.sender.token;
    orderAddresses[4] = order.signature.signatory;
    orderAddresses[5] = order.signature.validator;

    orderValues[0] = order.nonce;
    orderValues[1] = order.expiry;
    orderValues[2] = order.signer.amount;
    orderValues[3] = order.signer.id;
    orderValues[4] = order.sender.amount;
    orderValues[5] = order.sender.id;

    tokenKinds[0] = order.signer.kind;
    tokenKinds[1] = order.sender.kind;
    sigBytesComponents[0] = order.signature.r;
    sigBytesComponents[1] = order.signature.s;
    const sigUintComponent = order.signature.v;
    const version = order.signature.version;

    const hex = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[6]', 'bytes4[2]', 'bytes32[2]', 'uint8', 'bytes1'],
      [orderAddresses, orderValues, tokenKinds, sigBytesComponents, sigUintComponent, version],
    );

    const encodedParameters = web3.utils.hexToBytes(hex);

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
        encodedParameters,
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

