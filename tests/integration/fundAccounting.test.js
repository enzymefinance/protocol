/*
 * @file Tests fund accounting calculations in a real fund
 *
 * @test initial investment (with quote token)
 * @test sending quote token directly to Trading does not affect fund calcs
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer, manager, investor;
let defaultTxOpts, investorTxOpts;
let mln, weth;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  const fundFactory = contracts.FundFactory;

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
});

test('initial investment (with quote token)', async () => {
  const { accounting, participation } = fund;

  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');

  await send(weth, 'transfer', [investor, offeredValue], defaultTxOpts);
  await send(
    weth,
    'approve',
    [participation.options.address, offeredValue],
    investorTxOpts
  );
  await send(
    participation,
    'requestInvestment',
    [wantedShares, offeredValue, weth.options.address],
    { ...investorTxOpts, value: amguAmount }
  );
  await send(participation, 'executeRequestFor', [investor], investorTxOpts);

  const fundWethHoldings = await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
  const fundCalculations = await call(accounting, 'calcFundMetrics');

  expect(fundWethHoldings).toBe(offeredValue);
  expect(fundCalculations.gav_).toBe(offeredValue);
  expect(fundCalculations.feesInDenominationAsset_).toBe('0');
  expect(fundCalculations.feesInShares_).toBe('0');
  expect(fundCalculations.nav_).toBe(offeredValue);
  expect(fundCalculations.sharePrice_).toBe(offeredValue);
});

test('sending quote token directly to Trading does NOT affect fund calculations', async () => {
  const { accounting, vault } = fund;
  const tokenQuantity = toWei('1', 'ether');

  const preFundCalculations = await call(accounting, 'calcFundMetrics');
  const preFundWethHoldings = new BN(
    await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
  );

  await send(weth, 'transfer', [vault.options.address, tokenQuantity], defaultTxOpts);

  const postFundCalculations = await call(accounting, 'calcFundMetrics');
  const postFundWethHoldings = new BN(
    await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
  );
  
  expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings);
  expect(postFundCalculations).toEqual(preFundCalculations);
});
