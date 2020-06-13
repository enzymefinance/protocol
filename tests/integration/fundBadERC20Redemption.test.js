import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts;
let weth, omg, priceSource, zeroExExchange;
let fund;
let wethToEthRate, omgToEthRate;

// @dev Set fund denomination asset to OMG so it can receive OMG as investment
beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  weth = contracts.WETH;
  omg = contracts.OMG;
  zeroExExchange = contracts.ZeroExV2Exchange;
  priceSource = contracts.TestingPriceFeed;

  const fundFactory = contracts.FundFactory;
  const zeroExAdapter = contracts.ZeroExV2Adapter;

  wethToEthRate = toWei('1', 'ether');
  omgToEthRate = toWei('0.5', 'ether');

  await send(
    priceSource,
    'update',
    [
      [weth.options.address, omg.options.address],
      [wethToEthRate, omgToEthRate],
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    exchanges: [zeroExExchange.options.address],
    exchangeAdapters: [zeroExAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: omg,
    },
    manager,
    quoteToken: omg.options.address,
    fundFactory
  });
});

describe('Investor redeems BadERC20 token from a fund', () => {
  test('investor redeems shares', async () => {
    const { shares, vault } = fund;

    const fundBadERC20Balance = new BN(await call(omg, 'balanceOf', [vault.options.address]));
    expect(fundBadERC20Balance).bigNumberEq(new BN(toWei('1', 'ether')));

    const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(preInvestorShares).bigNumberGt(new BN(0));
    const preInvestorBadERC20Balance = new BN(await call(omg, 'balanceOf', [investor]));

    await send(shares, 'redeemShares', [], investorTxOpts);

    const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
    expect(postInvestorShares).bigNumberEq(new BN(0));
    const postInvestorBadERC20Balance = new BN(await call(omg, 'balanceOf', [investor]));
    expect(postInvestorBadERC20Balance.sub(preInvestorBadERC20Balance)).bigNumberEq(new BN(toWei('1', 'ether')));
  });
});
