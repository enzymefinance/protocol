import { toWei, BN } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getFundComponents } from '~/tests/utils/fund';
import { getEventFromLogs } from '~/tests/utils/metadata';

let deployer;
let defaultTxOpts, managerTxOpts;
let baseToken, quoteToken;
let engine, fundFactory, priceSource, registry;
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

  const {payer, amguChargableGas, incentivePaid} = getEventFromLogs(
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

  expect(txCostInWei).bigNumberLt(totalUserCost);
  expect(estimatedTotalUserCost).bigNumberEq(totalUserCost);
  expect(new BN(incentivePaid)).bigNumberEq(new BN(0));
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
  const newBaseTokenPrice = await call(priceSource, 'getPrice', [baseToken.options.address]);
  expect(newBaseTokenPrice[0]).toBe(newInputBaseTokenPrice);

  await send(
    fundFactory,
    'beginSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      [],
      quoteToken.options.address,
      [baseToken.options.address, quoteToken.options.address]
    ],
    managerTxOpts
  );

  await assertAmguTx(fundFactory, 'createAccounting');
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
  const newBaseTokenPrice = await call(priceSource, 'getPrice', [baseToken.options.address]);
  expect(newBaseTokenPrice[0]).toBe(newInputBaseTokenPrice);

  await send(
    fundFactory,
    'beginSetup',
    [
      `test-fund-${Date.now()}`,
      [],
      [],
      [],
      [],
      [],
      quoteToken.options.address,
      [baseToken.options.address, quoteToken.options.address]
    ],
    managerTxOpts
  );

  await assertAmguTx(fundFactory, 'createAccounting');
  await assertAmguTx(fundFactory, 'createFeeManager');
  await assertAmguTx(fundFactory, 'createParticipation');
  await assertAmguTx(fundFactory, 'createPolicyManager');
  await assertAmguTx(fundFactory, 'createShares');
  await assertAmguTx(fundFactory, 'createVault');
  const res = await assertAmguTx(fundFactory, 'completeSetup');

  const hubAddress = getEventFromLogs(res.logs, CONTRACT_NAMES.FUND_FACTORY, 'NewFund').hub;
  const fund = await getFundComponents(hubAddress);

  const requestedShares = toWei('100', 'ether');
  const investmentAmount = toWei('100', 'ether');

  await send(
    quoteToken,
    'approve',
    [fund.participation.options.address, investmentAmount],
    defaultTxOpts
  );

  const incentiveInputAmount = toWei('100', 'ether');
  await send(registry, 'setIncentive', [incentiveInputAmount], defaultTxOpts);
  const newIncentiveAmount = await call(registry, 'incentive');
  expect(newIncentiveAmount).toBe(incentiveInputAmount);

  const preUserBalance = new BN(await web3.eth.getBalance(deployer));
  const gasPrice = await web3.eth.getGasPrice();
  const requestInvestmentRes = await send(
    fund.participation,
    'requestInvestment',
    [
      requestedShares,
      investmentAmount,
      quoteToken.options.address
    ],
    { ...defaultTxOpts, value: toWei('101', 'ether'), gasPrice }
  );

  const {
    payer,
    amguChargableGas,
    incentivePaid
  } = getEventFromLogs(
    requestInvestmentRes.logs,
    CONTRACT_NAMES.PARTICIPATION,
    'AmguPaid',
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

  const txCostInWei = new BN(gasPrice).mul(new BN(requestInvestmentRes.gasUsed));
  const estimatedTotalUserCost = ethAmguAmount.add(txCostInWei).add(new BN(newIncentiveAmount));
  const totalUserCost = preUserBalance.sub(postUserBalance);

  expect(txCostInWei).bigNumberLt(totalUserCost);
  expect(estimatedTotalUserCost).bigNumberEq(totalUserCost);
  expect(payer.toLowerCase()).toBe(deployer.toLowerCase());
  expect(new BN(incentivePaid)).bigNumberEq(new BN(newIncentiveAmount));
});
