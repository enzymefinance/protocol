// TODO: make this into unit tests

import { toWei, BN } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getEventFromLogs } from '~/tests/utils/metadata';
import { getDeployed } from '~/tests/utils/getDeployed';

const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

const amguPrice = toWei('1', 'gwei');

let web3;
let deployer;
let defaultTxOpts, managerTxOpts;
let baseToken, quoteToken;
let engine, fundFactory, priceSource, registry, sharesRequestor;

const assertAmguTx = async (contract, method, args=[]) => {
  const arbitraryEthAmount = toWei('1', 'ether');
  const preUserBalance = new BN(await web3.eth.getBalance(deployer));
  const gasPrice = await web3.eth.getGasPrice();
  const result = await send(
    contract,
    method,
    args,
    { ...defaultTxOpts, value: arbitraryEthAmount, gasPrice },
    web3
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
    await call(
      priceSource,
      'convertQuantity',
      [mlnAmguAmount.toString(), mlnAddress, wethAddress]
    )
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

beforeEach(async () => {
  web3 = await startChain();

  [deployer] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  engine = getDeployed(CONTRACT_NAMES.ENGINE, web3);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);

  quoteToken = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  baseToken = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
});

// Reset amgu and incentive after all tests so as not to affect other tests in suite
afterEach(async () => {
  await send(engine, 'setAmguPrice', [0], defaultTxOpts, web3);
  const resetAmguPrice = await call(engine, 'getAmguPrice');
  expect(resetAmguPrice).toBe('0');

  const incentivePrice = toWei('0.01', 'ether');
  await send(registry, 'setIncentive', [incentivePrice], defaultTxOpts, web3);
  const resetIncentive = await call(registry, 'incentive');
  expect(resetIncentive).toBe(incentivePrice);
});

test('Set amgu and check its usage in single amguPayable function', async () => {
  await send(engine, 'setAmguPrice', [amguPrice], defaultTxOpts, web3);
  const newAmguPrice = await call(engine, 'getAmguPrice');
  expect(newAmguPrice).toBe(amguPrice);

  await send(
    fundFactory,
    'beginFundSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      quoteToken.options.address,
      [baseToken.options.address, quoteToken.options.address]
    ],
    managerTxOpts,
    web3
  );

  await assertAmguTx(fundFactory, 'createShares');
});

test('Set amgu with incentive attatched and check its usage in creating a fund', async () => {
  await send(engine, 'setAmguPrice', [amguPrice], defaultTxOpts, web3);
  const newAmguPrice = await call(engine, 'getAmguPrice');
  expect(newAmguPrice).toBe(amguPrice);

  await send(
    fundFactory,
    'beginFundSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      quoteToken.options.address,
      [baseToken.options.address, quoteToken.options.address]
    ],
    managerTxOpts,
    web3
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

  const requestedShares = toWei('100', 'ether');
  const investmentAmount = toWei('100', 'ether');

  await send(
    quoteToken,
    'approve',
    [sharesRequestor.options.address, investmentAmount],
    defaultTxOpts,
    web3
  );

  const incentiveInputAmount = toWei('100', 'ether');
  await send(registry, 'setIncentive', [incentiveInputAmount], defaultTxOpts, web3);
  const newIncentiveAmount = await call(registry, 'incentive');
  expect(newIncentiveAmount).toBe(incentiveInputAmount);

  const preUserBalance = new BN(await web3.eth.getBalance(deployer));
  const gasPrice = await web3.eth.getGasPrice();

  const requestSharesRes = await send(
    sharesRequestor,
    'requestShares',
    [
      hubAddress,
      quoteToken.options.address,
      investmentAmount,
      requestedShares
    ],
    { ...defaultTxOpts, value: toWei('101', 'ether'), gasPrice },
    web3
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
    await call(
      priceSource,
      'convertQuantity',
      [mlnAmguAmount.toString(), mlnAddress, wethAddress]
    )
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
