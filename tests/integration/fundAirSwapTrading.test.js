const { orders, signatures } = require('@airswap/order-utils');
const { GANACHE_PROVIDER } = require('@airswap/order-utils').constants;
import { toWei } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { send } from '~/deploy/utils/deploy-contract';
import { getFunctionSignature } from '~/tests/utils/metadata';
import getAccounts from '~/deploy/utils/getAccounts';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { setupFundWithParams } from '~/tests/utils/fund';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let contracts;
let mln, weth, swapContract, erc20TransferHandler;
let fund;
let testTakeOrderSignature;
let exchangeIndex;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts =  { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  testTakeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'testTakeOrder',
  );

  mln = contracts.MLN;
  weth = contracts.WETH;
  swapContract = contracts.Swap;
  erc20TransferHandler = contracts.ERC20TransferHandler;
  orders.setVerifyingContract(swapContract.options.address);

  const version = contracts.Version;
  const airSwapAdapter = contracts.AirSwapAdapter;

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
    const makerAssetAmount = toWei('1', 'ether');

    order = await orders.getOrder({
      signer: {
        wallet: deployer,
        token: mln.options.address,
        amount: makerAssetAmount,
      },
    });

    order.expiry = parseInt(order.expiry);

    const { trading, vault } = fund;
    const fillQuantity = toWei('0.05', 'ether');

    order.sender.wallet = trading.options.address;
    order.sender.token = weth.options.address;
    order.sender.amount = fillQuantity;

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
    orderAddresses[4] = order.affiliate.wallet;
    orderAddresses[5] = order.affiliate.token;
    orderAddresses[6] = order.signature.signatory;
    orderAddresses[7] = order.signature.validator;
    orderAddresses[8] = swapContract.options.address;

    orderValues[0] = order.nonce;
    orderValues[1] = order.expiry;
    orderValues[2] = order.signer.amount;
    orderValues[3] = order.signer.id;
    orderValues[4] = order.sender.amount;
    orderValues[5] = order.sender.id;
    orderValues[6] = order.affiliate.amount;
    orderValues[7] = order.affiliate.id;

    tokenKinds[0] = order.signer.kind;
    tokenKinds[1] = order.sender.kind;
    tokenKinds[2] = order.affiliate.kind;
    sigBytesComponents[0] = order.signature.r;
    sigBytesComponents[1] = order.signature.s;
    const sigUintComponent = order.signature.v;
    const version = order.signature.version;

    const hex = web3.eth.abi.encodeParameters(
      ['address[9]', 'uint[8]', 'bytes4[3]', 'bytes32[2]', 'uint8', 'bytes1'],
      [orderAddresses, orderValues, tokenKinds, sigBytesComponents, sigUintComponent, version],
    );

    const encodedParameters = web3.utils.hexToBytes(hex);

    await send(
      mln,
      'approve',
      [swapContract.options.address, makerAssetAmount],
      defaultTxOpts,
    );

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        testTakeOrderSignature,
        '0x0',
        encodedParameters,
      ],
      managerTxOpts,
    );

  });

});
