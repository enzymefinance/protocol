/*
 * @file Tests fund accounting calculations in a real fund
 *
 * @test initial investment (with quote token)
 * @test sending quote token directly to Vault does not affect fund calcs
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer, manager, investor;
let defaultTxOpts;
let mln, weth;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  const fundFactory = contracts.FundFactory;

  fund = await setupFundWithParams({
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
});

test('initial investment (with quote token)', async () => {
  const { hub, shares, vault } = fund;

  const contribAmount = toWei('1', 'ether');

  await investInFund({
    fundAddress: hub.options.address,
    investment: {
      contribAmount,
      investor,
      isInitial: true,
      tokenContract: weth
    }
  });

  const fundWethHoldings = await call(vault, 'assetBalances', [weth.options.address])
  const fundGav = await call(shares, 'calcGav');
  const fundSharePrice = await call(shares, 'calcSharePrice');

  expect(fundWethHoldings).toBe(contribAmount);
  expect(fundGav).toBe(contribAmount);
  expect(fundSharePrice).toBe(contribAmount);
});

test('sending quote token directly to Vault does NOT affect fund calculations', async () => {
  const { shares, vault } = fund;
  const tokenQuantity = toWei('1', 'ether');

  const preFundGav = await call(shares, 'calcGav');
  const preFundSharePrice = await call(shares, 'calcSharePrice');
  const preFundWethHoldings = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );

  await send(weth, 'transfer', [vault.options.address, tokenQuantity], defaultTxOpts);

  const postFundGav = await call(shares, 'calcGav');
  const postFundSharePrice = await call(shares, 'calcSharePrice');
  const postFundWethHoldings = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  
  expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings);
  expect(postFundGav).toEqual(preFundGav);
  expect(postFundSharePrice).toEqual(preFundSharePrice);
});
