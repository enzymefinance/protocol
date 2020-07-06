/*
 * @file Tests funds vault via the Oasis Dex adapter
 *
 * @test A fund can take an order in full
 */

import { BN, hexToNumber, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let mln, weth, oasisDexAdapter, oasisDexExchange, priceSource;
let takeOrderSignature;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER);
  oasisDexExchange = getDeployed(CONTRACT_NAMES.OASIS_DEX_EXCHANGE, mainnetAddrs.oasis.OasisDexExchange);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);

  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.OASIS_DEX_ADAPTER,
    'takeOrder',
  );

  fund = await setupFundWithParams({
    integrationAdapters: [oasisDexAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
});

describe('Fund can take an order (buy MLN with WETH)', () => {
  let makerAsset, makerQuantity, takerAsset, takerQuantity;
  let orderId;

  beforeAll(async () => {
    makerQuantity = toWei('0.1', 'ether');
    makerAsset = mln.options.address;
    takerAsset = weth.options.address;

    const makerToWethAssetRate = new BN(
      (await call(priceSource, 'getLiveRate', [makerAsset, weth.options.address]))[0]
    );

    takerQuantity = BNExpMul(
      new BN(makerQuantity),
      makerToWethAssetRate
    ).toString();
  });

  test('Third party makes an order', async () => {
    await send(mln, 'approve', [oasisDexExchange.options.address, makerQuantity], defaultTxOpts);
    const res = await send(
      oasisDexExchange,
      'offer',
      [
        makerQuantity, makerAsset, takerQuantity, takerAsset, 0
      ],
      defaultTxOpts
    );

    const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
    orderId = hexToNumber(logMake.id);
  });

  test('Fund takes the order', async () => {
    const { vault } = fund;

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    const encodedArgs = encodeArgs(
      CALL_ON_INTEGRATION_ENCODING_TYPES.OASIS_DEX.TAKE_ORDER,
      [
        takerQuantity, // exact outgoing asset amount (fill amount)
        orderId // order identifier
      ]
    );

    await send(
      vault,
      'callOnIntegration',
      [
        oasisDexAdapter.options.address,
        takeOrderSignature,
        encodedArgs,
      ],
      managerTxOpts
    );

    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

    const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
    const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

    // Confirm that expected asset amounts were filled
    expect(fundBalanceOfWethDiff).bigNumberEq(new BN(takerQuantity));
    expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerQuantity));
  });
});
