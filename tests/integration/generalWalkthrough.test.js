/*
 * @file General actions taken by users and funds in the lifespan of a fund
 *
 * @test A user can only invest in a fund if they are whitelisted and have set a token allowance for the fund
 * @test A fund can take an order (on Kyber)
 * @test A user cannot invest in a fund that has been shutdown
 * @test TODO: Calculate fees?
 * @test TODO: Redeem shares?
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv, BNExpMul } from '~/utils/BNmath';
import {
  CALL_ON_INTEGRATION_ENCODING_TYPES,
  CONTRACT_NAMES,
  KYBER_ETH_ADDRESS
} from '~/utils/constants';
import { encodeArgs, stringToBytes } from '~/utils/formatting';
import { investInFund, getFundComponents } from '~/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let offeredValue, amguAmount;
let mln, weth, fundFactory, kyberNetworkProxy, kyberAdapter, priceSource;
let takeOrderSignature;
let sharesRequestor, userWhitelist;
let managementFee, performanceFee;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, mainnetAddrs.kyber.KyberNetworkProxy);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  managementFee = getDeployed(CONTRACT_NAMES.MANAGEMENT_FEE);
  performanceFee = getDeployed(CONTRACT_NAMES.PERFORMANCE_FEE);
  userWhitelist = getDeployed(CONTRACT_NAMES.USER_WHITELIST);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR);

  const targetInvestorWeth = new BN(toWei('10', 'ether'));
  const currentInvestorWeth = new BN(await call(weth, 'balanceOf', [investor]));
  const wethToSend = targetInvestorWeth.sub(currentInvestorWeth);
  if (wethToSend.gt(new BN(0))) {
    await send(weth, 'transfer', [investor, wethToSend.toString()], defaultTxOpts);
  }
  await send(mln, 'transfer', [investor, toWei('10', 'ether')], defaultTxOpts);

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
    encodedSettings: [encodeArgs(['address[]'], [[deployer]])]
  };

  const fundName = stringToBytes(`Test fund ${Date.now()}`, 32);
  await send(fundFactory, 'beginFundSetup', [
    fundName,
    fees.contracts,
    fees.rates,
    fees.periods,
    policies.contracts,
    policies.encodedSettings,
    [kyberAdapter.options.address],
    weth.options.address
  ], managerTxOpts);
  await send(fundFactory, 'createFeeManager', [], managerTxOpts);
  await send(fundFactory, 'createPolicyManager', [], managerTxOpts);
  await send(fundFactory, 'createShares', [], managerTxOpts);
  await send(fundFactory, 'createVault', [], managerTxOpts);
  const res = await send(fundFactory, 'completeFundSetup', [], managerTxOpts);
  const hubAddress = getEventFromLogs(
    res.logs,
    CONTRACT_NAMES.FUND_FACTORY,
    'FundSetupCompleted'
  ).hub;

  fund = await getFundComponents(hubAddress);

  offeredValue = toWei('1', 'ether');
  amguAmount = toWei('0.1', 'ether');

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.KYBER_ADAPTER,
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
      { ...defaultTxOpts, value: amguAmount }
    )
  ).rejects.toThrowFlexible();
});

test('Buying shares (initial investment) fails for user not on whitelist', async () => {
  const { hub } = fund;

  await send(weth, 'transfer', [investor, offeredValue], defaultTxOpts);
  await send(
    weth,
    'approve',
    [sharesRequestor.options.address, offeredValue],
    investorTxOpts
  );
  await expect(
    send(
      sharesRequestor,
      'requestShares',
      [hub.options.address, offeredValue, "0"],
      { ...investorTxOpts, value: amguAmount }
    )
  ).rejects.toThrowFlexible("Rule evaluated to false: USER_WHITELIST");
});

test('Buying shares (initial investment) succeeds for whitelisted user with allowance', async () => {
  const { hub, policyManager, shares } = fund;

  const encodedUserWhitelistArgs = encodeArgs(['address[]', 'address[]'], [[investor], []]);
  await send(
    policyManager,
    'updatePolicySettings',
    [userWhitelist.options.address, encodedUserWhitelistArgs],
    managerTxOpts
  );

  const sharePrice = new BN(await call(shares, 'calcSharePrice'));
  const expectedShares = BNExpDiv(new BN(offeredValue), sharePrice);

  await send(
    sharesRequestor,
    'requestShares',
    [hub.options.address, offeredValue, "0"],
    { ...investorTxOpts, value: amguAmount }
  );

  const investorShares = await call(shares, 'balanceOf', [investor]);

  expect(investorShares).toEqual(expectedShares.toString());
});

test('Fund can take an order on Kyber', async () => {
  const { vault } = fund;

  const outgoingAsset = weth.options.address;
  const outgoingAssetAmount = toWei('0.1', 'ether');
  const incomingAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, incomingAsset, outgoingAssetAmount],
  );

  const expectedIncomingAssetAmount = BNExpMul(
    new BN(outgoingAssetAmount.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      incomingAsset, // incoming asset
      expectedIncomingAssetAmount, // min incoming asset amount
      outgoingAsset, // outgoing asset,
      outgoingAssetAmount // exact outgoing asset amount
    ]
  );

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
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
  expect(fundBalanceOfWethDiff).bigNumberEq(new BN(outgoingAssetAmount));
  expect(fundBalanceOfMlnDiff).bigNumberEq(new BN(expectedIncomingAssetAmount));
});

// TODO - redeem shares?

// TODO - calculate fees?

test('Cannot invest in a shutdown fund', async () => {
  const { hub } = fund;

  await send(hub, 'shutDownFund', [], managerTxOpts);
  await expect(
    investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount: offeredValue,
        investor,
        isInitial: true,
        tokenContract: weth
      }
    })
  ).rejects.toThrowFlexible("Fund is not active");
});
