/*
 * @file General actions taken by users and funds in the lifespan of a fund
 *
 * @test A user can only invest in a fund if they are whitelisted and have set a token allowance for the fund
 * @test A fund can take an order (on OasisDex)
 * @test A user cannot invest in a fund that has been shutdown
 * @test TODO: Calculate fees?
 * @test TODO: Redeem shares?
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv, BNExpMul } from '~/utils/BNmath';
import { CONTRACT_NAMES } from '~/utils/constants';
import { encodeArgs, stringToBytes } from '~/utils/formatting';
import { investInFund, getFundComponents } from '~/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/utils/metadata';
import { encodeOasisDexTakeOrderArgs } from '~/utils/oasisDex';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let offeredValue, amguAmount;
let mln, weth, fundFactory, oasisDex, oasisDexAdapter, priceSource;
let takeOrderFunctionSig;
let sharesRequestor, userWhitelist;
let managementFee, performanceFee;
let fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  oasisDex = getDeployed(CONTRACT_NAMES.OASIS_DEX_INTERFACE, web3, mainnetAddrs.oasis.OasisDexExchange);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
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

  const policies = {
    contracts: [userWhitelist.options.address],
    encodedSettings: [encodeArgs(['address[]'], [[deployer]], web3)]
  };

  const fundName = stringToBytes(`Test fund ${Date.now()}`, 32);
  await send(fundFactory, 'beginFundSetup', [
    fundName,
    fees.contracts,
    fees.rates,
    fees.periods,
    policies.contracts,
    policies.encodedSettings,
    [oasisDexAdapter.options.address],
    weth.options.address
  ], managerTxOpts, web3);
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
  amguAmount = toWei('0.1', 'ether');

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );
});

test('Request shares fails for whitelisted user with no allowance', async () => {
  const { hub } = fund;

  await expect(
    send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, offeredValue, "0"],
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
      [hub.options.address, offeredValue, "0"],
      { ...investorTxOpts, value: amguAmount },
      web3
    )
  ).rejects.toThrowFlexible("Rule evaluated to false: USER_WHITELIST");
});

test('Buying shares (initial investment) succeeds for whitelisted user with allowance', async () => {
  const { hub, policyManager, shares } = fund;

  const encodedUserWhitelistArgs = encodeArgs(['address[]', 'address[]'], [[investor], []], web3);
  await send(
    policyManager,
    'updatePolicySettings',
    [userWhitelist.options.address, encodedUserWhitelistArgs],
    managerTxOpts,
    web3
  );

  const sharePrice = new BN(await call(shares, 'calcSharePrice'));
  const expectedShares = BNExpDiv(new BN(offeredValue), sharePrice);

  await send(
    sharesRequestor,
    'requestShares',
    [hub.options.address, offeredValue, "0"],
    { ...investorTxOpts, value: amguAmount },
    web3
  );

  const investorShares = await call(shares, 'balanceOf', [investor]);

  expect(investorShares).toEqual(expectedShares.toString());
});

test('Fund can take an order on Oasis DEX', async () => {
  const { vault } = fund;

  const makerQuantity = (new BN(toWei('0.1', 'ether'))).toString();
  const makerAsset = mln.options.address;
  const takerAsset = weth.options.address;

  const makerToWethAssetRate = new BN(
    (await call(priceSource, 'getLiveRate', [makerAsset, takerAsset])).rate_
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
      makerQuantity, makerAsset, takerQuantity, takerAsset
    ],
    defaultTxOpts,
    web3
  );

  const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_INTERFACE, 'LogMake');
  const orderId = logMake.id;

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeOasisDexTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
    orderId,
  }, web3);

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

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const fundBalanceOfWethDiff = preFundBalanceOfWeth.sub(postFundBalanceOfWeth);
  const fundBalanceOfMlnDiff = postFundBalanceOfMln.sub(preFundBalanceOfMln);

  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(makerQuantity));
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(takerQuantity));
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
