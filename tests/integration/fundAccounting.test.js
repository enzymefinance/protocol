/*
 * @file Tests fund accounting calculations in a real fund
 * @dev This is largely a placeholder for when we start to do accounting internally,
 * rather than relying on what is in the vault
 *
 * @test initial investment (with quote token)
 * @test send quote token directly to a vault
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

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  const version = contracts.Version;

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    manager,
    quoteToken: weth.options.address,
    version
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

  const fundWethHoldings = await call(accounting, 'assetHoldings', [weth.options.address])
  const fundCalculations = await call(accounting, 'performCalculations');

  expect(fundWethHoldings).toBe(offeredValue);
  expect(fundCalculations.gav).toBe(offeredValue);
  expect(fundCalculations.feesInDenominationAsset).toBe('0');
  expect(fundCalculations.feesInShares).toBe('0');
  expect(fundCalculations.nav).toBe(offeredValue);
  expect(fundCalculations.sharePrice).toBe(offeredValue);
});

test('send quote token directly to a vault', async () => {
  const { accounting, vault } = fund;
  const tokenQuantity = toWei('1', 'ether');

  const preFundCalculations = await call(accounting, 'performCalculations');
  const preFundWethHoldings = new BN(
    await call(accounting, 'assetHoldings', [weth.options.address])
  );

  await send(weth, 'transfer', [vault.options.address, tokenQuantity], defaultTxOpts);

  const postFundCalculations = await call(accounting, 'performCalculations');
  const postFundWethHoldings = new BN(
    await call(accounting, 'assetHoldings', [weth.options.address])
  );

  expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings.add(new BN(tokenQuantity)));
  expect(new BN(postFundCalculations.gav)).bigNumberEq(
    new BN(preFundCalculations.gav).add(new BN(tokenQuantity))
  );
  expect(postFundCalculations.feesInDenominationAsset).toBe('0');
  expect(postFundCalculations.feesInShares).toBe('0');
  expect(new BN(postFundCalculations.nav)).bigNumberEq(
    new BN(preFundCalculations.gav).add(new BN(tokenQuantity))
  );
  expect(new BN(postFundCalculations.sharePrice)).bigNumberEq(
    new BN(preFundCalculations.sharePrice).add(new BN(tokenQuantity))
  );
});
