import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { getEventFromLogs } from '~/utils/metadata';
import { delay } from '~/utils/time';
import { updateKyberPriceFeed } from '~/utils/updateKyberPriceFeed';
import { getDeployed } from '~/utils/getDeployed';

export const getFundComponents = async (hubAddress, web3) => {
  const components = {};

  components.hub = getDeployed(CONTRACT_NAMES.HUB, web3, hubAddress);
  components.feeManager = getDeployed(CONTRACT_NAMES.FEE_MANAGER, web3, await call(components.hub, 'feeManager'));
  components.policyManager = getDeployed(CONTRACT_NAMES.POLICY_MANAGER, web3, await call(components.hub, 'policyManager'));
  components.shares = getDeployed(CONTRACT_NAMES.SHARES, web3, await call(components.hub, 'shares'));
  components.vault = getDeployed(CONTRACT_NAMES.VAULT, web3, await call(components.hub, 'vault'));

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

  const hub = getDeployed(CONTRACT_NAMES.HUB, web3, fundAddress);
  const registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3, await call(hub, 'REGISTRY'));
  const sharesRequestor = getDeployed(
    CONTRACT_NAMES.SHARES_REQUESTOR,
    web3,
    await call(registry, 'sharesRequestor')
  );

  // TODO: need to calculate amgu estimates here instead of passing in arbitrary value
  if (!amguTxValue) {
    amguTxValue = toWei('0.01', 'ether');
  }

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
      {},
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
    [hub.options.address, contribAmount, 0],
    { ...investorTxOpts, value: amguTxValue },
    web3
  );

  // Update prices and executes request if not initial investment
  if (isInitial !== true) {
    await delay(1000);
    await updateKyberPriceFeed(tokenPriceData.priceSource, web3);
    await send(
      sharesRequestor,
      'executeRequestFor',
      [investor, hub.options.address],
      investorTxOpts,
      web3
    );
  }
}

export const setupFundWithParams = async ({
  amguTxValue,
  fees = {
    addresses: [],
    rates: [],
    periods: [],
  },
  policies = {
    addresses: [],
    encodedSettings: []
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
      policies.addresses,
      policies.encodedSettings,
      integrationAdapters,
      quoteToken
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
export const setupInvestedTestFund = async (
  mainnetAddrs,
  manager,
  amguTxValue = null,
  web3
) => {
  const [deployer] = await web3.eth.getAccounts();

  const weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  const performanceFee = getDeployed(CONTRACT_NAMES.PERFORMANCE_FEE, web3);
  const managementFee = getDeployed(CONTRACT_NAMES.MANAGEMENT_FEE, web3);
  const engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER, web3);
  const kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);
  const oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  const uniswapAdapter = getDeployed(CONTRACT_NAMES.UNISWAP_ADAPTER, web3);
  const zeroExV2Adapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ADAPTER, web3);
  const zeroExV3Adapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V3_ADAPTER, web3);

  const managementFeeRate = toWei('.02', 'ether');
  const performanceFeeRate = toWei('.2', 'ether');
  const managementFeePeriod = 0;
  const performanceFeePeriod = 60 * 60 * 24 * 90; // 90 days

  let adapterAddresses = [
    engineAdapter.options.address,
    kyberAdapter.options.address,
    oasisDexAdapter.options.address,
    uniswapAdapter.options.address,
    zeroExV2Adapter.options.address,
    zeroExV3Adapter.options.address
  ];

  return setupFundWithParams({
    amguTxValue,
    integrationAdapters: adapterAddresses,
    fees: {
      addresses: [
        managementFee.options.address,
        performanceFee.options.address
      ],
      rates: [
        managementFeeRate,
        performanceFeeRate
      ],
      periods: [
        managementFeePeriod,
        performanceFeePeriod
      ],
    },
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor: deployer, // Easier to use deployer to start manager and investor shares at 0
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });
};
