/*
 * @file Tests a fund trading with multiple exchange adapters
 *
 * @test A fund can add an exchange adapter after it is created
 * @test A fund can take an order with the newly-added exchange
 * @test TODO: multiple tests for make and take orders on multiple exchanges
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS, KYBER_ETH_ADDRESS } from '~/tests/utils/constants';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let takeOrderFunctionSig;
let mln, weth;
let oasisDex, oasisDexAdapter;
let kyberNetworkProxy, kyberAdapter, kyberExchangeIndex;
let version, fund;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );

  mln = contracts.MLN;
  version = contracts.Version;
  weth = contracts.WETH;

  oasisDex = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;

  kyberNetworkProxy = contracts.KyberNetworkProxy;
  kyberAdapter = contracts.KyberAdapter;

  // Setup fund
  await version.methods
    .beginSetup(
      'Test fund',
      [],
      [],
      [],
      [oasisDex.options.address],
      [oasisDexAdapter.options.address],
      weth.options.address,
      [mln.options.address, weth.options.address],
    ).send(managerTxOpts);
  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(hubAddress);

  // Seed investor with weth and invest in fund
  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');
  await weth.methods
    .transfer(investor, offeredValue)
    .send(defaultTxOpts);
  await weth.methods
    .approve(fund.participation.options.address, offeredValue)
    .send(investorTxOpts);
  await fund.participation.methods
    .requestInvestment(offeredValue, wantedShares, weth.options.address)
    .send({ ...investorTxOpts, value: amguAmount });
  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);
});

test("add Kyber to fund's allowed exchanges", async () => {
  const { trading } = fund;

  const preAddExchangeCount = (await trading.methods.getExchangeInfo().call())[0].length;

  await trading.methods
    .addExchange(kyberNetworkProxy.options.address, kyberAdapter.options.address)
    .send(managerTxOpts);

  const exchangeInfo = await fund.trading.methods
    .getExchangeInfo()
    .call();
  kyberExchangeIndex = exchangeInfo[1].findIndex(
    e => e.toLowerCase() === kyberAdapter.options.address.toLowerCase()
  );

  expect(kyberExchangeIndex).toBe(preAddExchangeCount);
});

test('fund takes an order on Kyber', async () => {
  const { trading, vault } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const { 0: expectedRate } = await kyberNetworkProxy.methods
    .getExpectedRate(KYBER_ETH_ADDRESS, makerAsset, takerQuantity)
    .call(defaultTxOpts);

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preMlnVault = new BN(
    await mln.methods.balanceOf(vault.options.address).call()
  );
  const preWethVault = new BN(
    await weth.methods.balanceOf(vault.options.address).call()
  );

  await trading.methods
    .callOnExchange(
      kyberExchangeIndex,
      takeOrderFunctionSig,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        makerAsset,
        takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0',
    )
    .send(managerTxOpts);

  const postMlnVault = new BN(
    await mln.methods.balanceOf(vault.options.address).call()
  );
  const postWethVault = new BN(
    await weth.methods.balanceOf(vault.options.address).call()
  );

  expect(postWethVault).bigNumberEq(preWethVault.sub(new BN(takerQuantity)));
  expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(makerQuantity)));
});
