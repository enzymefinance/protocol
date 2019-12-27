import { BN, toWei } from 'web3-utils';

import { call, fetchContract, send } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { BNExpDiv } from '~/tests/utils/BNmath';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import getAccounts from '~/deploy/utils/getAccounts';
import { getEventFromLogs } from '~/tests/utils/metadata';

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
  components.vault = fetchContract('Vault', routes.vault);

  return components;
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
  await send(version, 'createVault', [], managerTxOptsWithAmgu);
  const res = await send(version, 'completeSetup', [], managerTxOptsWithAmgu);

  const hubAddress = getEventFromLogs(res.logs, CONTRACT_NAMES.VERSION, 'NewFund').hub;
  const fund = await getFundComponents(hubAddress);

  // Make initial investment, if applicable
  if (new BN(initialInvestment.contribAmount).gt(new BN(0))) {
    const investorTxOpts = { ...managerTxOpts, from: initialInvestment.investor };
    // const amguAmount = toWei('.1', 'ether');
    // Calculate amount of shares to buy with contribution
    const shareCost = new BN(
      await call(
        fund.accounting,
        'getShareCostInAsset',
        [toWei('1', 'ether'), initialInvestment.tokenContract.options.address]
      )
    );
    const wantedShares = BNExpDiv(new BN(initialInvestment.contribAmount), shareCost).toString();

    // Fund investor with contribution token, if necessary
    const investorTokenBalance = new BN(
      await call(
        initialInvestment.tokenContract,
        'balanceOf',
        [initialInvestment.investor]
      )
    );
    const investorTokenShortfall =
      new BN(initialInvestment.contribAmount).sub(investorTokenBalance);
    if (investorTokenShortfall.gt(new BN(0))) {
      await send(
        initialInvestment.tokenContract,
        'transfer',
        [initialInvestment.investor, investorTokenShortfall.toString()],
        { ...managerTxOpts, from: deployer }
      )
    }
    // Invest in fund
    await send(
      initialInvestment.tokenContract,
      'approve',
      [fund.participation.options.address, initialInvestment.contribAmount],
      investorTxOpts
    )
    await send(
      fund.participation,
      'requestInvestment',
      [wantedShares, initialInvestment.contribAmount, initialInvestment.tokenContract.options.address],
      { ...investorTxOpts, value: amguTxValue }
    )
    await send(
      fund.participation,
      'executeRequestFor',
      [initialInvestment.investor],
      { ...investorTxOpts, value: amguTxValue }
    )
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
  const ethfinexRegistered = await call(
    contracts.Registry, 'exchangeAdapterIsRegistered', [contracts.EthfinexAdapter.options.address]
  );
  if (ethfinexRegistered) {
    exchangeAddresses.push(contracts.ZeroExV2Exchange.options.address);
    adapterAddresses.push(contracts.EthfinexAdapter.options.address);
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
