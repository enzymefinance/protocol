/*
 * @file Tests fund accounting calculations in a real fund
 *
 * @test initial investment (with quote token)
 * @test sending quote token directly to Vault does not affect fund calcs
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { investInFund, setupFundWithParams } from '~/utils/fund';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager, investor;
let defaultTxOpts;
let mln, weth;
let fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  fund = await setupFundWithParams({
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
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
    },
    web3
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

  await send(weth, 'transfer', [vault.options.address, tokenQuantity], defaultTxOpts, web3);

  const postFundGav = await call(shares, 'calcGav');
  const postFundSharePrice = await call(shares, 'calcSharePrice');
  const postFundWethHoldings = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  
  expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings);
  expect(postFundGav).toEqual(preFundGav);
  expect(postFundSharePrice).toEqual(preFundSharePrice);
});
