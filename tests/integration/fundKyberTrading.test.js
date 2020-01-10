/*
 * @file Tests funds trading via the Kyber adapter
 *
 * @test Fund receives WETH via investor participation
 * @test Fund takes a MLN order with WETH using KyberNetworkProxy's expected price
 * @test Fund takes a WETH order with MLN using KyberNetworkProxy's expected price
 * @test Fund takes a EUR order with MLN without intermediary options specified
 * @test Fund take order fails with too high maker quantity
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul } from '~/tests/utils/BNmath';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  KYBER_ETH_ADDRESS,
} from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

describe('fund-kyber-trading', () => {
  let accounts, defaultTxOpts, managerTxOpts;
  let deployer, manager, investor;
  let contracts, deployOut;
  let exchangeIndex, takeOrderSignature;
  let version, kyberAdapter, kyberNetworkProxy, weth, mln, eur;
  let fund;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };

    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    contracts = deployed.contracts;
    deployOut = deployed.deployOut;

    version = contracts.Version;
    kyberAdapter = contracts.KyberAdapter;
    kyberNetworkProxy = contracts.KyberNetworkProxy;
    weth = contracts.WETH;
    mln = contracts.MLN;
    eur = contracts.EUR;

    await version.methods
      .beginSetup(
        stringToBytes('Test fund', 32),
        [],
        [],
        [],
        [kyberNetworkProxy.options.address],
        [kyberAdapter.options.address],
        weth.options.address.toString(),
        [mln.options.address.toString(), weth.options.address.toString()],
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

    const exchangeInfo = await fund.trading.methods
      .getExchangeInfo()
      .call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === kyberAdapter.options.address.toLowerCase(),
    );
    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder'
    );

    await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));

    // Seed investor with weth
    await weth.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);
  });

  test('fund receives ETH from investment', async () => {
    const investorTxOpts = { ...defaultTxOpts, from: investor };
    const offeredValue = toWei('1', 'ether');
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();

    await weth.methods
      .approve(fund.participation.options.address, offeredValue)
      .send(investorTxOpts);
    await fund.participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });
    await fund.participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(new BN(postWethInvestor.toString()))
      .bigNumberEq(new BN(preWethInvestor.toString()).sub(new BN(offeredValue.toString())));
    expect(new BN(postWethFund.toString()))
      .bigNumberEq(new BN(preWethFund.toString()).add(new BN(offeredValue.toString())));
  });

  test('swap WETH for MLN with expected rate from kyberNetworkProxy', async () => {
    const { trading } = fund;

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

    const preMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
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

    const postMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(new BN(postWethFund.toString()))
      .bigNumberEq(new BN(preWethFund.toString()).sub(new BN(takerQuantity.toString())));
    expect(new BN(postMlnFund.toString()))
      .bigNumberEq(new BN(preMlnFund.toString()).add(new BN(makerQuantity.toString())));
  });

  test('swap MLN for WETH with expected rate from kyberNetworkProxy', async () => {
    const { trading } = fund;

    const takerAsset = mln.options.address;
    const takerQuantity = toWei('0.01', 'ether');
    const makerAsset = weth.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(takerAsset, KYBER_ETH_ADDRESS, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity.toString()),
      new BN(expectedRate.toString()),
    ).toString();

    const preMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
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

    const postMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(new BN(postMlnFund.toString()))
      .bigNumberEq(new BN(preMlnFund.toString()).sub(new BN(takerQuantity.toString())));
    expect(new BN(postWethFund.toString()))
      .bigNumberEq(new BN(preWethFund.toString()).add(new BN(makerQuantity.toString())));
  });

  test('swap MLN directly to EUR without intermediary', async () => {
    const { trading } = fund;

    const takerAsset = mln.options.address;
    const takerQuantity = toWei('0.01', 'ether');
    const makerAsset = eur.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(takerAsset, makerAsset, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity.toString()),
      new BN(expectedRate.toString()),
    ).toString();

    const preEurFund = await eur.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
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

    const postEurFund = await eur.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(postWethFund.toString()).toBe(preWethFund.toString());
    expect( new BN(postMlnFund.toString()))
      .bigNumberEq(new BN(preMlnFund.toString()).sub(new BN(takerQuantity.toString())));
    expect(new BN(postEurFund.toString()))
      .bigNumberEq(new BN(preEurFund.toString()).add(new BN(makerQuantity.toString())));
  });

  test('swap fails if make quantity is too high', async () => {
    const { trading } = fund;

    const takerAsset = mln.options.address;
    const takerQuantity = toWei('0.1', 'ether');
    const makerAsset = eur.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(takerAsset, makerAsset, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity.toString()),
      new BN(expectedRate.toString()).mul(new BN(2)),
    ).toString();

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
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
        .send(managerTxOpts),
    ).rejects.toThrow();
  });
});
