// TODO: make this into unit tests

import { toWei, BN } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getEventFromLogs } from '~/tests/utils/metadata';

let deployer;
let defaultTxOpts, managerTxOpts;
let baseToken, quoteToken;
let engine, fundFactory, priceSource, registry, sharesRequestor, valueInterpreter;
let amguPrice;

async function assertAmguTx(contract, method, args = []) {
  const arbitraryEthAmount = toWei('1', 'ether');
  const preUserBalance = new BN(await web3.eth.getBalance(deployer));
  const gasPrice = await web3.eth.getGasPrice();
  const result = await send(
    contract,
    method,
    args,
    { ...defaultTxOpts, value: arbitraryEthAmount, gasPrice }
  );

  const {
    payer,
    totalAmguPaidInEth,
    amguChargableGas
  } = getEventFromLogs(
    result.logs,
    CONTRACT_NAMES.AMGU_CONSUMER,
    'AmguPaid',
  );

  // TODO: This method does not result in less than the estimate
  if (method === 'completeSetup') return result;

  const postUserBalance = new BN(await web3.eth.getBalance(deployer));

  const wethAddress = await call(registry, 'nativeAsset');
  const mlnAddress = await call(registry, 'mlnToken');
  const mlnAmguAmount = new BN(amguPrice).mul(new BN(amguChargableGas));
  const ethAmguAmount = new BN(
    (await call(
      valueInterpreter,
      'calcCanonicalAssetValue',
      [mlnAddress, mlnAmguAmount.toString(), wethAddress]
    ))[0]
  );
  const txCostInWei = new BN(gasPrice).mul(new BN(result.gasUsed));
  const estimatedTotalUserCost = ethAmguAmount.add(txCostInWei);
  const totalUserCost = preUserBalance.sub(postUserBalance);

  expect(new BN(totalAmguPaidInEth)).bigNumberEq(ethAmguAmount);
  expect(txCostInWei).bigNumberLt(totalUserCost);
  expect(estimatedTotalUserCost).bigNumberEq(totalUserCost);
  expect(payer.toLowerCase()).toBe(deployer.toLowerCase());

  return result;
}

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  amguPrice = toWei('1', 'gwei');
})

beforeEach(async () => {
  const deployed = await partialRedeploy([
    CONTRACT_NAMES.FUND_FACTORY
  ]);
  const contracts = deployed.contracts;

  engine = contracts.Engine;
  fundFactory = contracts.FundFactory;
  registry = contracts.Registry;
  priceSource = contracts.TestingPriceFeed;
  sharesRequestor = contracts.SharesRequestor;
  valueInterpreter = contracts.ValueInterpreter;

  quoteToken = contracts.WETH;
  baseToken = contracts.MLN;
});

// Reset amgu and incentive after all tests so as not to affect other tests in suite
afterEach(async () => {
  await send(engine, 'setAmguPrice', [0], defaultTxOpts);
  const resetAmguPrice = await call(engine, 'getAmguPrice');
  expect(resetAmguPrice).toBe('0');

  const incentivePrice = toWei('0.01', 'ether');
  await send(registry, 'setIncentive', [incentivePrice], defaultTxOpts);
  const resetIncentive = await call(registry, 'incentive');
  expect(resetIncentive).toBe(incentivePrice);
});

test('Set amgu and check its usage in single amguPayable function', async () => {
  await send(engine, 'setAmguPrice', [amguPrice], defaultTxOpts);
  const newAmguPrice = await call(engine, 'getAmguPrice');
  expect(newAmguPrice).toBe(amguPrice);

  const newInputBaseTokenPrice = toWei('2', 'ether');
  await send(
    priceSource,
    'update',
    [[baseToken.options.address], [newInputBaseTokenPrice]],
    defaultTxOpts
  );
  const newBaseTokenPrice = await call(
    priceSource,
    'getCanonicalRate',
    [baseToken.options.address, quoteToken.options.address]
  );
  expect(newBaseTokenPrice[0]).toBe(newInputBaseTokenPrice);

  await send(
    fundFactory,
    'beginFundSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      quoteToken.options.address
    ],
    managerTxOpts
  );

  await assertAmguTx(fundFactory, 'createShares');
});

test('set amgu with incentive attatched and check its usage in creating a fund', async () => {
  await send(engine, 'setAmguPrice', [amguPrice], defaultTxOpts);
  const newAmguPrice = await call(engine, 'getAmguPrice');
  expect(newAmguPrice).toBe(amguPrice);

  const newInputBaseTokenPrice = toWei('2', 'ether');
  await send(
    priceSource,
    'update',
    [[baseToken.options.address], [newInputBaseTokenPrice]],
    defaultTxOpts
  );
  const newBaseTokenPrice = await call(
    priceSource,
    'getCanonicalRate',
    [baseToken.options.address, quoteToken.options.address]
  );
  expect(newBaseTokenPrice[0]).toBe(newInputBaseTokenPrice);

  await send(
    fundFactory,
    'beginFundSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      quoteToken.options.address
    ],
    managerTxOpts
  );

  await assertAmguTx(fundFactory, 'createFeeManager');
  await assertAmguTx(fundFactory, 'createPolicyManager');
  await assertAmguTx(fundFactory, 'createShares');
  await assertAmguTx(fundFactory, 'createVault');
  const res = await assertAmguTx(fundFactory, 'completeFundSetup');

  const hubAddress = getEventFromLogs(
    res.logs,
    CONTRACT_NAMES.FUND_FACTORY,
    'FundSetupCompleted'
  ).hub;

  const investmentAmount = toWei('100', 'ether');

  await send(
    quoteToken,
    'approve',
    [sharesRequestor.options.address, investmentAmount],
    defaultTxOpts
  );

  const incentiveInputAmount = toWei('100', 'ether');
  await send(registry, 'setIncentive', [incentiveInputAmount], defaultTxOpts);
  const newIncentiveAmount = await call(registry, 'incentive');
  expect(newIncentiveAmount).toBe(incentiveInputAmount);

  const preUserBalance = new BN(await web3.eth.getBalance(deployer));
  const gasPrice = await web3.eth.getGasPrice();

  const requestSharesRes = await send(
    sharesRequestor,
    'requestShares',
    [
      hubAddress,
      investmentAmount,
      "0"
    ],
    { ...defaultTxOpts, value: toWei('101', 'ether'), gasPrice }
  );

  const {
    payer: payerFromAmguPaid,
    totalAmguPaidInEth,
    amguChargableGas
  } = getEventFromLogs(
    requestSharesRes.logs,
    CONTRACT_NAMES.SHARES_REQUESTOR,
    'AmguPaid',
  );

  const {
    payer: payerFromIncentivePaid,
    incentiveAmount
  } = getEventFromLogs(
    requestSharesRes.logs,
    CONTRACT_NAMES.SHARES_REQUESTOR,
    'IncentivePaid',
  );

  const postUserBalance = new BN(await web3.eth.getBalance(deployer));
  const wethAddress = await call(registry, 'nativeAsset');
  const mlnAddress = await call(registry, 'mlnToken');
  const mlnAmguAmount = new BN(amguPrice).mul(new BN(amguChargableGas));
  const ethAmguAmount = new BN(
    (await call(
      valueInterpreter,
      'calcCanonicalAssetValue',
      [mlnAddress, mlnAmguAmount.toString(), wethAddress]
    ))[0]
  );

  const txCostInWei = new BN(gasPrice).mul(new BN(requestSharesRes.gasUsed));

  // @dev Incentive fee is not applicable here because the user gets the incentive fee
  // returned immediately, as it is the initial investment into the fund,
  // which bypasses creating a Request and immediately buys shares
  const estimatedTotalUserCost = ethAmguAmount.add(txCostInWei);
  const totalUserCost = preUserBalance.sub(postUserBalance);

  expect(new BN(totalAmguPaidInEth)).bigNumberEq(ethAmguAmount);
  expect(new BN(incentiveAmount)).bigNumberEq(new BN(incentiveInputAmount));
  expect(txCostInWei).bigNumberLt(totalUserCost);
  expect(estimatedTotalUserCost).bigNumberEq(totalUserCost);
  expect(payerFromAmguPaid.toLowerCase()).toBe(deployer.toLowerCase());
  expect(payerFromIncentivePaid.toLowerCase()).toBe(deployer.toLowerCase());
});
