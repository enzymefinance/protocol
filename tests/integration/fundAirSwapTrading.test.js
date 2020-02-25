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
let mln, weth, airSwapExchange, erc20TransferHandler;
let swapTokenSignature;
let exchangeIndex;
let fund, contracts;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts =  { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  swapTokenSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'swapToken',
  );

  mln = contracts.MLN;
  weth = contracts.WETH;
  airSwapExchange = contracts.Swap;
  erc20TransferHandler = contracts.ERC20TransferHandler;
  orders.setVerifyingContract(airSwapExchange.options.address);

  const version = contracts.Version;
  const airSwapAdapter = contracts.AirSwapAdapter;

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [airSwapExchange.options.address],
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

  test('manager takes order through adapter', async () => {
    const { trading, vault } = fund;
    const makerAssetAmount = toWei('1', 'ether');
    const fillQuantity = toWei('0.05', 'ether');

    const order = await orders.getOrder({
      signer: {
        wallet: deployer,
        token: mln.options.address,
        amount: makerAssetAmount,
      },
    });

    order.expiry = parseInt(order.expiry);
    order.sender.wallet = trading.options.address;
    order.sender.token = weth.options.address;
    order.sender.amount = fillQuantity;
    order.affiliate.kind = '0x0';

    order.signature = await signatures.getWeb3Signature(
      order,
      deployer,
      airSwapExchange.options.address,
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
      ['address[6]', 'uint[6]', 'bytes4[2]', 'bytes32[2]', 'uint8', 'bytes1'],
      [orderAddresses, orderValues, tokenKinds, sigBytesComponents, sigUintComponent, version],
    );

    const encodedArgs = web3.utils.hexToBytes(hex);

    await send(
      mln,
      'approve',
      [airSwapExchange.options.address, makerAssetAmount],
      defaultTxOpts,
    );

    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        swapTokenSignature,
        '0x0',
        encodedArgs,
      ],
      managerTxOpts,
    );
  });

});
