import { BN, toWei, randomHex } from 'web3-utils';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { stringToBytes } from '../utils/new/formatting';
import { BNExpMul } from '../utils/new/BNmath';
import {
  CONTRACT_NAMES,
  EXCHANGES,
  EMPTY_ADDRESS,
  KYBER_ETH_ADDRESS,
} from '../utils/new/constants';
import { getFunctionSignature } from '../utils/new/metadata';
const getFundComponents = require('../utils/new/getFundComponents');
const updateTestingPriceFeed = require('../utils/new/updateTestingPriceFeed');
const web3 = require('../../../deploy/utils/get-web3');
const {partialRedeploy} = require('../../../deploy/scripts/deploy-system');

describe('fund-kyber-trading', () => {
  let environment, accounts, defaultTxOpts, managerTxOpts;
  let deployer, manager, investor;
  let contracts, deployOut;
  let exchangeIndex, takeOrderSignature;
  let initialTokenAmount;
  let version, kyberAdapter, kyberNetwork, kyberNetworkProxy, weth, mln, eur;
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
    kyberNetwork = contracts.KyberNetwork;
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

    initialTokenAmount = toWei('10', 'ether');

    await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));
  });

  test('investor gets initial ethToken for testing)', async () => {
    const preWethInvestor = await weth.methods.balanceOf(investor).call();

    await weth.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);

    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(new BN(postWethInvestor.toString()))
      .toEqualBN(new BN(preWethInvestor.toString()).add(new BN(initialTokenAmount.toString())));
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
      .toEqualBN(new BN(preWethInvestor.toString()).sub(new BN(offeredValue.toString())));
    expect(new BN(postWethFund.toString()))
      .toEqualBN(new BN(preWethFund.toString()).add(new BN(offeredValue.toString())));
  });

  test('swap ethToken for mln with specific order price (minRate)', async () => {
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
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        randomHexOfSize(32),
        '0x0',
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
      .toEqualBN(new BN(preWethFund.toString()).sub(new BN(takerQuantity.toString())));
    expect(new BN(postMlnFund.toString()))
      .toEqualBN(new BN(preMlnFund.toString()).add(new BN(makerQuantity.toString())));
  });

  test('swap mlnToken for ethToken with specific order price (minRate)', async () => {
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
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        randomHexOfSize(32),
        '0x0',
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
      .toEqualBN(new BN(preMlnFund.toString()).sub(new BN(takerQuantity.toString())));
    expect(new BN(postWethFund.toString()))
      .toEqualBN(new BN(preWethFund.toString()).add(new BN(makerQuantity.toString())));
  });

  test('swap mlnToken directly to eurToken without minimum destAmount', async () => {
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
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        randomHexOfSize(32),
        '0x0',
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
      .toEqualBN(new BN(preMlnFund.toString()).sub(new BN(takerQuantity.toString())));
    expect(new BN(postEurFund.toString()))
      .toEqualBN(new BN(preEurFund.toString()).add(new BN(makerQuantity.toString())));
  });

  test('takeOrder fails if minPrice is not satisfied', async () => {
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

    expect(
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
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          randomHexOfSize(32),
          '0x0',
          '0x0',
          '0x0',
        )
        .send(managerTxOpts),
    ).resolves.toThrow();
  });
});
