import { BN, toWei } from 'web3-utils';

import { call, fetchContract, send } from '~/deploy/utils/deploy-contract';

import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';
import { getEventFromLogs } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

export const getFundComponents = async (hubAddress, web3) => {
  const components = {};

  components.hub = fetchContract('Hub', hubAddress, web3);
  const routes = await call(components.hub, 'routes');
  components.feeManager = fetchContract('FeeManager', routes.feeManager, web3);
  components.policyManager = fetchContract('PolicyManager', routes.policyManager, web3);
  components.shares = fetchContract('Shares', routes.shares, web3);
  components.vault = fetchContract('Vault', routes.vault, web3);
  return components;
}

export const investInFund = async ({
  fundAddress,
  investment,
  amguTxValue,
  tokenPriceData,
  web3
}) => {
  const { contribAmount, tokenContract, investor, isInitial = false } = investment;
  const investorTxOpts = { from: investor, gas: 8000000 };

  const hub = fetchContract(CONTRACT_NAMES.HUB, fundAddress, web3);
  const routes = await call(hub, 'routes');
  const registry = fetchContract(CONTRACT_NAMES.REGISTRY, await call(hub, 'REGISTRY'), web3);
  const shares = fetchContract(CONTRACT_NAMES.SHARES,  await call(hub, 'shares'), web3);
  const sharesRequestor = fetchContract(
    CONTRACT_NAMES.SHARES_REQUESTOR,
    await call(registry, 'sharesRequestor'),
    web3
  );
  // TODO: need to calculate amgu estimates here instead of passing in arbitrary value
  if (!amguTxValue) {
    amguTxValue = toWei('0.01', 'ether');
  }

  // Calculate amount of shares to buy with contribution
  const shareCost = new BN(
    await call(
      shares,
      'getSharesCostInAsset',
      [toWei('1', 'ether'), tokenContract.options.address]
    )
  );

  const wantedShares = BNExpDiv(new BN(contribAmount), shareCost).toString();

  // Fund investor with contribution token, if necessary
  const investorTokenBalance = new BN(
    await call(
      tokenContract,
      'balanceOf',
      [investor]
    )
  );
  const investorTokenShortfall =
    new BN(contribAmount).sub(investorTokenBalance);
  if (investorTokenShortfall.gt(new BN(0))) {
    await send(
      tokenContract,
      'transfer',
      [investor, investorTokenShortfall.toString()],
      investorTxOpts,
      web3
    )
  }
  // Invest in fund
  await send(
    tokenContract,
    'approve',
    [sharesRequestor.options.address, contribAmount],
    investorTxOpts,
    web3
  )
  await send(
    sharesRequestor,
    'requestShares',
    [hub.options.address, tokenContract.options.address, contribAmount, wantedShares],
    { ...investorTxOpts, value: amguTxValue },
    web3
  );

  // Update prices and executes reqeust if not initial investment
  if (isInitial !== true) {
    await delay(1000);
    await updateTestingPriceFeed(
      tokenPriceData.priceSource,
      tokenPriceData.tokenAddresses,
      tokenPriceData.tokenPrices
    );
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor, hub.options.address],
      { ...investorTxOpts, value: amguTxValue },
      web3
    );
  }
}

export const setupFundWithParams = async ({
  amguTxValue,
  defaultTokens,
  fees = {
    addresses: [],
    rates: [],
    periods: [],
  },
  initialInvestment = {
    contribAmount: 0,
    investor: undefined,
    tokenContract: undefined
  },
  integrationAdapters = [],
  manager,
  name = `test-fund-${Date.now()}`,
  quoteToken,
  fundFactory,
  web3
}) => {
  const managerTxOpts = { from: manager, gas: 8000000 };

  // TODO: need to calculate amgu estimates here instead of passing in arbitrary value
  if (!amguTxValue) {
    amguTxValue = toWei('0.01', 'ether')
  }
  const managerTxOptsWithAmgu = { ...managerTxOpts, value: amguTxValue };

  await send(
    fundFactory,
    'beginFundSetup',
    [
      name,
      fees.addresses,
      fees.rates,
      fees.periods,
      integrationAdapters,
      quoteToken,
      defaultTokens,
    ],
    managerTxOpts,
    web3
  );

  await send(fundFactory, 'createFeeManager', [], managerTxOptsWithAmgu, web3);
  await send(fundFactory, 'createPolicyManager', [], managerTxOptsWithAmgu, web3);
  await send(fundFactory, 'createShares', [], managerTxOptsWithAmgu, web3);
  await send(fundFactory, 'createVault', [], managerTxOptsWithAmgu, web3);
  const res = await send(fundFactory, 'completeFundSetup', [], managerTxOptsWithAmgu, web3);

  const hubAddress = getEventFromLogs(
    res.logs,
    CONTRACT_NAMES.FUND_FACTORY,
    'FundSetupCompleted'
  ).hub;
  const fund = await getFundComponents(hubAddress, web3);

  // Make initial investment, if applicable
  if (new BN(initialInvestment.contribAmount).gt(new BN(0))) {
    await investInFund({
      amguTxValue,
      fundAddress: fund.hub.options.address,
      investment: { ...initialInvestment, isInitial: true },
      web3
    });
  }

  return fund;
}

// Creates a basic fund with all our integration adapters, fees, and some initial investment
// @dev `contracts` is an object of web3.Contract instances
export const setupInvestedTestFund = async (contracts, manager, amguTxValue = null) => {
  const [deployer] = await getAccounts();

  const weth = contracts.WETH;
  const mln = contracts.MLN;
  const fundFactory = contracts.FundFactory;
  const performanceFee = contracts.PerformanceFee;
  const managementFee = contracts.ManagementFee;

  const managementFeeRate = toWei('.02', 'ether');
  const performanceFeeRate = toWei('.2', 'ether');
  const managementFeePeriod = 0;
  const performanceFeePeriod = 60 * 60 * 24 * 90; // 90 days

  let adapterAddresses = [
    contracts.EngineAdapter.options.address,
    contracts.KyberAdapter.options.address,
    contracts.OasisDexAdapter.options.address,
    contracts.UniswapAdapter.options.address,
    contracts.ZeroExV2Adapter.options.address,
    contracts.ZeroExV3Adapter.options.address
  ];

  return setupFundWithParams({
    amguTxValue,
    defaultTokens: [mln.options.address, weth.options.address],
    integrationAdapters: adapterAddresses,
    fees: {
      addresses: [managementFee.options.address, performanceFee.options.address],
      rates: [managementFeeRate, performanceFeeRate],
      periods: [managementFeePeriod, performanceFeePeriod],
    },
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor: deployer, // Easier to use deployer to start manager and investor shares at 0
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });
};
