import { toWei } from 'web3-utils';

import getFundComponents from '~/tests/utils/getFundComponents';

// `contracts` is an object of web3.Contract instances
const setupInvestedTestFund = async (contracts, manager) => {
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

  const exchangeAddresses = [
    contracts.OasisDexExchange.options.address,
    contracts.KyberNetworkProxy.options.address,
    contracts.ZeroExV2Exchange.options.address,
    contracts.ZeroExV2Exchange.options.address,
    contracts.Engine.options.address,
  ];

  const exchangeAdapterAddresses = [
    contracts.OasisDexAdapter.options.address,
    contracts.KyberAdapter.options.address,
    contracts.ZeroExV2Adapter.options.address,
    contracts.EthfinexAdapter.options.address,
    contracts.EngineAdapter.options.address,
  ];

  let txOptionsWithValue = Object.assign({}, managerTxOpts);
  txOptionsWithValue = Object.assign(txOptionsWithValue, {value: toWei('10', 'ether')});
  await version.methods
    .beginSetup(
      fundName,
      [managementFee.options.address, performanceFee.options.address],
      [managementFeeRate, performanceFeeRate],
      [managementFeePeriod, performanceFeePeriod],
      exchangeAddresses,
      exchangeAdapterAddresses,
      weth.options.address,
      [weth.options.address, mln.options.address],
    ).send(managerTxOpts);
  await version.methods.createAccounting().send(txOptionsWithValue);
  await version.methods.createFeeManager().send(txOptionsWithValue);
  await version.methods.createParticipation().send(txOptionsWithValue);
  await version.methods.createPolicyManager().send(txOptionsWithValue);
  await version.methods.createShares().send(txOptionsWithValue);
  await version.methods.createTrading().send(txOptionsWithValue);
  await version.methods.createVault().send(txOptionsWithValue);
  const res = await version.methods.completeSetup().send(txOptionsWithValue);
  const hubAddress = res.events.NewFund.returnValues.hub;
  const fund = await getFundComponents(hubAddress);

  const investmentAmount = toWei('1', 'ether');
  const requestedShares = toWei('1', 'ether');

  await weth.methods.approve(
    fund.participation.options.address, investmentAmount
  ).send(managerTxOpts);

  await fund.participation.methods.requestInvestment(
    requestedShares,
    investmentAmount,
    weth.options.address
  ).send(txOptionsWithValue);

  await fund.participation.methods.executeRequestFor(manager).send(txOptionsWithValue);

  return fund;
};

module.exports = setupInvestedTestFund;
