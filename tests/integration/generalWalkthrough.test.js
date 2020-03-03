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
import { BN, hexToNumber, toWei } from 'web3-utils';
import { deploy, call, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import { getFundComponents } from '~/tests/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts;
let exchangeIndex;
let offeredValue, wantedShares, amguAmount;
let mln, weth, version, oasisDex, oasisDexAdapter, priceSource;
let takeOrderFunctionSig;
let priceTolerance, userWhitelist;
let managementFee, performanceFee;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
  contracts = deployed.contracts;

  userWhitelist = await deploy(CONTRACT_NAMES.USER_WHITELIST, [[]]);

  mln = contracts.MLN;
  weth = contracts.WETH;
  version = contracts.Version;
  oasisDex = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  priceSource = contracts.TestingPriceFeed;
  priceTolerance = contracts.PriceTolerance;
  managementFee = contracts.ManagementFee;
  performanceFee = contracts.PerformanceFee;

  offeredValue = toWei('1', 'ether');
  wantedShares = toWei('1', 'ether');
  amguAmount = toWei('.01', 'ether');

  const targetInvestorWeth = new BN(toWei('10', 'ether'));
  const currentInvestorWeth = new BN(await call(weth, 'balanceOf', [investor]));
  const wethToSend = targetInvestorWeth.sub(currentInvestorWeth);
  if (wethToSend.gt(new BN(0))) {
    await send(weth, 'transfer', [investor, wethToSend.toString()], defaultTxOpts);
  }
  await send(mln, 'transfer', [investor, toWei('10', 'ether')], defaultTxOpts);

  await send(priceSource, 'update', [
    [weth.options.address, mln.options.address],
    [toWei('1', 'ether'), toWei('0.5', 'ether')],
  ], defaultTxOpts);

  const fees = {
    contracts: [
      managementFee.options.address,
      performanceFee.options.address
    ],
    rates: [toWei('0.02', 'ether'), toWei('0.2', 'ether')],
    periods: [0, 7776000], // 0 and 90 days
  };
  const fundName = stringToBytes(`Test fund ${Date.now()}`, 32);
  await send(version, 'beginSetup', [
    fundName,
    fees.contracts,
    fees.rates,
    fees.periods,
    [oasisDex.options.address],
    [oasisDexAdapter.options.address],
    weth.options.address,
    [weth.options.address, mln.options.address],
  ], managerTxOpts);
  await send(version, 'createAccounting', [], managerTxOpts);
  await send(version, 'createFeeManager', [], managerTxOpts);
  await send(version, 'createParticipation', [], managerTxOpts);
  await send(version, 'createPolicyManager', [], managerTxOpts);
  await send(version, 'createShares', [], managerTxOpts);
  await send(version, 'createTrading', [], managerTxOpts);
  const res = await send(version, 'completeSetup', [], managerTxOpts);
  const hubAddress = getEventFromLogs(res.logs, CONTRACT_NAMES.VERSION, 'NewFund').hub;

  fund = await getFundComponents(hubAddress);

  exchangeIndex = 0;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
  await send(fund.policyManager, 'register', [
    encodeFunctionSignature(takeOrderFunctionSig),
    priceTolerance.options.address,
  ], managerTxOpts);

  const requestInvestmentFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.PARTICIPATION,
    'requestInvestment',
  );
  await send(fund.policyManager, 'register', [
    encodeFunctionSignature(requestInvestmentFunctionSig),
    userWhitelist.options.address,
  ], managerTxOpts);
});

test('Request investment fails for whitelisted user with no allowance', async () => {
  const { participation } = fund;

  await expect(
    send(participation,
      'requestInvestment', [offeredValue, wantedShares, weth.options.address],
      { ...defaultTxOpts, value: amguAmount }
    )
  ).rejects.toThrowFlexible();
});

test('Request investment fails for user not on whitelist', async () => {
  const { participation } = fund;

  await send(weth, 'approve', [
    participation.options.address, offeredValue],
    investorTxOpts
  );

  await expect(
    send(participation,
      'requestInvestment', [offeredValue, wantedShares, weth.options.address],
      { ...investorTxOpts, value: amguAmount }
    ),
  ).rejects.toThrowFlexible("Rule evaluated to false: UserWhitelist");
});

test('Request investment succeeds for whitelisted user with allowance', async () => {
  const { participation, shares } = fund;

  await send(userWhitelist, 'addToWhitelist', [investor], defaultTxOpts);
  await send(participation, 'requestInvestment', [
    offeredValue, wantedShares, weth.options.address
  ], { ...investorTxOpts, value: amguAmount });
  await send(participation, 'executeRequestFor', [investor], investorTxOpts);
  const investorShares = await call(shares, 'balanceOf', [investor]);

  expect(investorShares.toString()).toEqual(wantedShares.toString());
});

test('Fund can take an order on Oasis DEX', async () => {
  const { accounting, trading } = fund;

  const makerQuantity = toWei('2', 'ether');
  const makerAsset = mln.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const takerAsset = weth.options.address;

  await send(mln, 'approve', [oasisDex.options.address, makerQuantity], defaultTxOpts);
  const res = await send(oasisDex, 'offer', [
    makerQuantity, makerAsset, takerQuantity, takerAsset, 0
  ], defaultTxOpts);

  const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
  const orderId = logMake.id;

  const preMlnFundHoldings = await call(accounting, 'getFundHoldingsForAsset', [mln.options.address]);
  const preWethFundHoldings = await call(accounting, 'getFundHoldingsForAsset', [weth.options.address]);

  const orderAddresses = [];
  const orderValues = [];

  orderAddresses[0] = makerAsset;
  orderAddresses[1] = takerAsset;
  orderValues[0] = makerQuantity;
  orderValues[1] = takerQuantity;

  const hex = web3.eth.abi.encodeParameters(
    ['address[2]', 'uint256[2]', 'uint256'],
    [orderAddresses, orderValues, orderId],
  );
  const encodedArgs = web3.utils.hexToBytes(hex);

  await send(
    trading,
    'callOnExchange',
    [
      exchangeIndex,
      takeOrderFunctionSig,
      '0x0',
      encodedArgs,
    ],
    managerTxOpts,
  );

  const postMlnFundHoldings = await call(accounting, 'getFundHoldingsForAsset', [mln.options.address]);
  const postWethFundHoldings = await call(accounting, 'getFundHoldingsForAsset', [weth.options.address]);

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
  const { hub, participation } = fund;

  await send(version, 'shutDownFund', [hub.options.address], managerTxOpts);
  await send(weth, 'approve', [participation.options.address, offeredValue], investorTxOpts);
  await expect(
    send(
      participation,
      'requestInvestment',
      [offeredValue, wantedShares, weth.options.address],
      { ...investorTxOpts, value: amguAmount }
    ),
  ).rejects.toThrowFlexible("Hub is shut down");
});
