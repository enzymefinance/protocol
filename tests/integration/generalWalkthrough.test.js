/*
 * @file General actions taken by users and funds in the lifespan of a fund
 *
 * @test A user can only invest in a fund if they are whitelisted and have set a token allowance for the fund
 * @test A fund can take an order (on OasisDex)
 * @test A user cannot invest in a fund that has been shutdown
 * @test TODO: Calculate fees?
 * @test TODO: Redeem shares?
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import { investInFund, getFundComponents } from '~/tests/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { encodeOasisDexTakeOrderArgs } from '~/tests/utils/oasisDex';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let offeredValue, wantedShares, amguAmount;
let mln, weth, fundFactory, oasisDex, oasisDexAdapter, priceSource;
let takeOrderFunctionSig;
let priceTolerance, sharesRequestor, userWhitelist;
let managementFee, performanceFee;
let fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };


  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  oasisDex = getDeployed(CONTRACT_NAMES.OASIS_DEX_EXCHANGE, web3, mainnetAddrs.oasis.OasisDexExchange);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  priceTolerance = getDeployed(CONTRACT_NAMES.PRICE_TOLERANCE, web3);
  managementFee = getDeployed(CONTRACT_NAMES.MANAGEMENT_FEE, web3);
  performanceFee = getDeployed(CONTRACT_NAMES.PERFORMANCE_FEE, web3);
  userWhitelist = getDeployed(CONTRACT_NAMES.USER_WHITELIST, web3);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);

  const targetInvestorWeth = new BN(toWei('10', 'ether'));
  const currentInvestorWeth = new BN(await call(weth, 'balanceOf', [investor]));
  const wethToSend = targetInvestorWeth.sub(currentInvestorWeth);
  if (wethToSend.gt(new BN(0))) {
    await send(weth, 'transfer', [investor, wethToSend.toString()], defaultTxOpts, web3);
  }
  await send(mln, 'transfer', [investor, toWei('10', 'ether')], defaultTxOpts, web3);

  const fees = {
    contracts: [
      managementFee.options.address,
      performanceFee.options.address
    ],
    rates: [toWei('0.02', 'ether'), toWei('0.2', 'ether')],
    periods: [0, 7776000], // 0 and 90 days
  };
  const fundName = stringToBytes(`Test fund ${Date.now()}`, 32);
  await send(
    fundFactory,
    'beginFundSetup',
    [
      fundName,
      fees.contracts,
      fees.rates,
      fees.periods,
      [oasisDexAdapter.options.address],
      weth.options.address,
      [weth.options.address, mln.options.address],
    ],
    managerTxOpts,
    web3
  );
  await send(fundFactory, 'createFeeManager', [], managerTxOpts, web3);
  await send(fundFactory, 'createPolicyManager', [], managerTxOpts, web3);
  await send(fundFactory, 'createShares', [], managerTxOpts, web3);
  await send(fundFactory, 'createVault', [], managerTxOpts, web3);
  const res = await send(fundFactory, 'completeFundSetup', [], managerTxOpts, web3);
  const hubAddress = getEventFromLogs(
    res.logs,
    CONTRACT_NAMES.FUND_FACTORY,
    'FundSetupCompleted'
  ).hub;

  fund = await getFundComponents(hubAddress, web3);

  offeredValue = toWei('1', 'ether');
  const shareCost = new BN(
    await call(
      fund.shares,
      'getSharesCostInAsset',
      [toWei('1', 'ether'), weth.options.address]
    )
  );
  wantedShares = BNExpDiv(new BN(offeredValue), shareCost).toString();
  amguAmount = toWei('0.1', 'ether');

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  await send(
    fund.policyManager,
    'register',
    [
      encodeFunctionSignature(takeOrderFunctionSig),
      priceTolerance.options.address,
    ],
    managerTxOpts,
    web3
  );

  const buySharesFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.SHARES,
    'buyShares',
  );
  await send(
    fund.policyManager,
    'register',
    [
      encodeFunctionSignature(buySharesFunctionSig),
      userWhitelist.options.address,
    ],
    managerTxOpts,
    web3
  );
});

test('Request shares fails for whitelisted user with no allowance', async () => {
  const { hub } = fund;

  await expect(
    send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, weth.options.address, offeredValue, wantedShares],
      { ...defaultTxOpts, value: amguAmount },
      web3
    )
  ).rejects.toThrowFlexible();
});

test('Buying shares (initial investment) fails for user not on whitelist', async () => {
  const { hub } = fund;

  await send(weth, 'transfer', [investor, offeredValue], defaultTxOpts, web3);
  await send(
    weth,
    'approve',
    [sharesRequestor.options.address, offeredValue],
    investorTxOpts,
    web3
  );
  await expect(
    send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, weth.options.address, offeredValue, wantedShares],
      { ...investorTxOpts, value: amguAmount },
      web3
    )
  ).rejects.toThrowFlexible("Rule evaluated to false: UserWhitelist");
});

test('Buying shares (initial investment) succeeds for whitelisted user with allowance', async () => {
  const { hub, shares } = fund;

  await send(userWhitelist, 'addToWhitelist', [investor], defaultTxOpts, web3);

  await send(
    sharesRequestor,
    'requestShares',
    [hub.options.address, weth.options.address, offeredValue, wantedShares],
    { ...investorTxOpts, value: amguAmount },
    web3
  );

  const investorShares = await call(shares, 'balanceOf', [investor]);

  expect(investorShares.toString()).toEqual(wantedShares.toString());
});

test('Fund can take an order on Oasis DEX', async () => {
  const { vault } = fund;

  const makerQuantity = toWei('2', 'ether');
  const makerAsset = mln.options.address;
  const takerAsset = weth.options.address;

  const makerToWethAssetRate = new BN(
    (await call(priceSource, 'getPrice', [makerAsset]))[0]
  );

  const takerQuantity = BNExpMul(
    new BN(makerQuantity),
    makerToWethAssetRate
  ).toString();


  await send(mln, 'approve', [oasisDex.options.address, makerQuantity], defaultTxOpts, web3);
  const res = await send(
    oasisDex,
    'offer',
    [
      makerQuantity, makerAsset, takerQuantity, takerAsset, 0
    ],
    defaultTxOpts,
    web3
  );

  const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
  const orderId = logMake.id;

  const preMlnFundHoldings = await call(vault, 'assetBalances', [mln.options.address]);
  const preWethFundHoldings = await call(vault, 'assetBalances', [weth.options.address]);

  const encodedArgs = encodeOasisDexTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
    orderId,
  });

  await send(
    vault,
    'callOnIntegration',
    [
      oasisDexAdapter.options.address,
      takeOrderFunctionSig,
      encodedArgs,
    ],
    managerTxOpts,
    web3
  );

  const postMlnFundHoldings = await call(vault, 'assetBalances', [mln.options.address]);
  const postWethFundHoldings = await call(vault, 'assetBalances', [weth.options.address]);

  expect(
    new BN(postMlnFundHoldings.toString()).eq(
      new BN(preMlnFundHoldings.toString()).add(new BN(makerQuantity.toString())),
    ),
  ).toBe(true);
  expect(
    new BN(postWethFundHoldings.toString()).eq(
      new BN(preWethFundHoldings.toString()).sub(new BN(takerQuantity.toString())),
    ),
  ).toBe(true);
});

// TODO - redeem shares?

// TODO - calculate fees?

test('Cannot invest in a shutdown fund', async () => {
  const { hub } = fund;

  await send(hub, 'shutDownFund', [], managerTxOpts, web3);
  await expect(
    investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount: offeredValue,
        investor,
        isInitial: true,
        tokenContract: weth
      },
      web3
    })
  ).rejects.toThrowFlexible("Fund is not active");
});
