import { BN, toWei } from 'web3-utils';

import { call, fetchContract, send } from '~/deploy/utils/deploy-contract';

import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';
import { getEventFromLogs } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

export const getFundComponents = async hubAddress => {
  const components = {};
  components.hub = fetchContract('Hub', hubAddress);
  const routes = await call(components.hub, 'routes');
  components.accounting = fetchContract('Accounting', routes.accounting);
  components.feeManager = fetchContract('FeeManager', routes.feeManager);
  components.participation = fetchContract('Participation', routes.participation);
  components.policyManager = fetchContract('PolicyManager', routes.policyManager);
  components.shares = fetchContract('Shares', routes.shares);
  components.trading = fetchContract('Trading', routes.trading);

  return components;
}

export const investInFund = async ({ fundAddress, investment, amguTxValue, tokenPriceData }) => {
  const { contribAmount, tokenContract, investor, isInitial = false } = investment;
  const investorTxOpts = { from: investor, gas: 8000000 };

  const hub = fetchContract('Hub', fundAddress);
  const routes = await call(hub, 'routes');
  const accounting = fetchContract('Accounting', routes.accounting);
  const participation = fetchContract('Participation', routes.participation);

  // TODO: need to calculate amgu estimates here instead of passing in arbitrary value
  if (!amguTxValue) {
    amguTxValue = toWei('0.01', 'ether');
  }

  // Calculate amount of shares to buy with contribution
  const shareCost = new BN(
    await call(
      accounting,
      'getShareCostInAsset',
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
      [investor, investorTokenShortfall.toString()]
    )
  }

  // Invest in fund
  await send(
    tokenContract,
    'approve',
    [participation.options.address, contribAmount],
    investorTxOpts
  )
  await send(
    participation,
    'requestInvestment',
    [wantedShares, contribAmount, tokenContract.options.address],
    { ...investorTxOpts, value: amguTxValue }
  )

  // Update prices if not initial investment
  if (isInitial !== true) {
    await delay(1000);
    await updateTestingPriceFeed(
      tokenPriceData.priceSource,
      tokenPriceData.tokenAddresses,
      tokenPriceData.tokenPrices
    );
  }

  await send(
    participation,
    'executeRequestFor',
    [investor],
    { ...investorTxOpts, value: amguTxValue }
  )
}

export const setupFundWithParams = async ({
  amguTxValue,
  defaultTokens,
  exchanges = [],
  exchangeAdapters = [],
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
  manager,
  name = `test-fund-${Date.now()}`,
  quoteToken,
  version
}) => {
  const [deployer] = await getAccounts();
  const managerTxOpts = { from: manager, gas: 8000000 };

  // TODO: need to calculate amgu estimates here instead of passing in arbitrary value
  if (!amguTxValue) {
    amguTxValue = toWei('0.01', 'ether')
  }
  const managerTxOptsWithAmgu = { ...managerTxOpts, value: amguTxValue };
  await send(
    version,
    'beginSetup',
    [
      name,
      fees.addresses,
      fees.rates,
      fees.periods,
      exchanges,
      exchangeAdapters,
      quoteToken,
      defaultTokens,
    ],
    managerTxOpts
  );

  await send(version, 'createAccounting', [], managerTxOptsWithAmgu);
  await send(version, 'createFeeManager', [], managerTxOptsWithAmgu);
  await send(version, 'createParticipation', [], managerTxOptsWithAmgu);
  await send(version, 'createPolicyManager', [], managerTxOptsWithAmgu);
  await send(version, 'createShares', [], managerTxOptsWithAmgu);
  await send(version, 'createTrading', [], managerTxOptsWithAmgu);
  const res = await send(version, 'completeSetup', [], managerTxOptsWithAmgu);

  const hubAddress = getEventFromLogs(res.logs, CONTRACT_NAMES.VERSION, 'NewFund').hub;
  const fund = await getFundComponents(hubAddress);

  // Make initial investment, if applicable
  if (new BN(initialInvestment.contribAmount).gt(new BN(0))) {
    await investInFund({
      amguTxValue,
      fundAddress: fund.hub.options.address,
      investment: { ...initialInvestment, isInitial: true },
    });
  }

  return fund;
}

// Creates a basic fund with all our exchange adapters, fees, and some initial investment
// @dev `contracts` is an object of web3.Contract instances
export const setupInvestedTestFund = async (contracts, manager, amguTxValue = null) => {
  const [deployer] = await getAccounts();
  const managerTxOpts = { from: manager, gas: 8000000 };

  const weth = contracts.WETH;
  const mln = contracts.MLN;
  const version = contracts.Version;
  const performanceFee = contracts.PerformanceFee;
  const managementFee = contracts.ManagementFee;

  const fundName = `test-fund-${Date.now()}`;
  const managementFeeRate = toWei('.02', 'ether');
  const performanceFeeRate = toWei('.2', 'ether');
  const managementFeePeriod = 0;
  const performanceFeePeriod = 60 * 60 * 24 * 90; // 90 days

  let exchangeAddresses = [];
  let adapterAddresses = [];

  const engineRegistered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.EngineAdapter.options.address]
  );
  if (engineRegistered) {
    exchangeAddresses.push(contracts.Engine.options.address);
    adapterAddresses.push(contracts.EngineAdapter.options.address);
  }
  const kyberRegistered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.KyberAdapter.options.address]
  );
  if (kyberRegistered) {
    exchangeAddresses.push(contracts.KyberNetworkProxy.options.address);
    adapterAddresses.push(contracts.KyberAdapter.options.address);
  }
  const oasisDexRegistered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.OasisDexAdapter.options.address]
  );
  if (oasisDexRegistered) {
    exchangeAddresses.push(contracts.OasisDexExchange.options.address);
    adapterAddresses.push(contracts.OasisDexAdapter.options.address);
  }
  const uniswapRegistered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.UniswapAdapter.options.address]
  );
  if (uniswapRegistered) {
    exchangeAddresses.push(contracts.UniswapFactory.options.address);
    adapterAddresses.push(contracts.UniswapAdapter.options.address);
  }
  const zeroExV2Registered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.ZeroExV2Adapter.options.address]
  );
  if (zeroExV2Registered) {
    exchangeAddresses.push(contracts.ZeroExV2Exchange.options.address);
    adapterAddresses.push(contracts.ZeroExV2Adapter.options.address);
  }
  const zeroExV3Registered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.ZeroExV3Adapter.options.address]
  );
  if (zeroExV3Registered) {
    exchangeAddresses.push(contracts.ZeroExV3Exchange.options.address);
    adapterAddresses.push(contracts.ZeroExV3Adapter.options.address);
  }

  return setupFundWithParams({
    amguTxValue,
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: exchangeAddresses,
    exchangeAdapters: adapterAddresses,
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
    version
  });

  return fund;
};
