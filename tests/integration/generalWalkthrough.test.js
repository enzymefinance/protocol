/*
 * @file General actions taken by users and funds in the lifespan of a fund
 *
 * @test A user can only invest in a fund if they are whitelisted and have set a token allowance for the fund
 * @test A fund can take an order (on OasisDex)
 * @test A fund can make an order (on OasisDex)
 * @test A user cannot invest in a fund that has been shutdown
 * @test TODO: Calculate fees?
 * @test TODO: Redeem shares?
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, hexToNumber, toWei } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
} from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import {
  getEventFromReceipt,
  getFunctionSignature
} from '~/tests/utils/metadata';

describe('general-walkthrough', () => {
  let deployer, manager, investor;
  let defaultTxOpts, managerTxOpts, investorTxOpts;
  let contracts;
  let exchangeIndex;
  let offeredValue, wantedShares, amguAmount;
  let mln, weth, version, oasisDex, oasisDexAdapter, priceSource;
  let priceTolerance, userWhitelist;
  let managementFee, performanceFee;
  let fund;

  beforeAll(async () => {
    [deployer, manager, investor] = await web3.eth.getAccounts();
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
    contracts = deployed.contracts;

    userWhitelist = await deploy(CONTRACT_NAMES.USER_WHITELIST, [[]]);

    mln = contracts.MLN;
    weth = contracts.WETH;
    version = contracts.Version;
    oasisDex = contracts.OasisDexExchange;
    oasisDexAdapter = contracts.OasisDexAdapter;
    priceSource = contracts.TestingPriceFeed;
    priceTolerance = contracts.PriceTolerance;
    managementFee = contracts.ManagementFee;
    performanceFee = contracts.PerformanceFee;

    offeredValue = toWei('1', 'ether');
    wantedShares = toWei('1', 'ether');
    amguAmount = toWei('.01', 'ether');

    await weth.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);
    await mln.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);

    await priceSource.methods
      .update(
        [weth.options.address, mln.options.address],
        [toWei('1', 'ether'), toWei('0.5', 'ether')],
      )
      .send(defaultTxOpts);

    const fees = {
      contracts: [
        managementFee.options.address,
        performanceFee.options.address
      ],
      rates: [toWei('0.02', 'ether'), toWei('0.2', 'ether')],
      periods: [0, 7776000], // 0 and 90 days
    };
    const fundName = stringToBytes('Test fund', 32);
    await version.methods
      .beginSetup(
        fundName,
        fees.contracts,
        fees.rates,
        fees.periods,
        [oasisDex.options.address],
        [oasisDexAdapter.options.address],
        weth.options.address,
        [weth.options.address, mln.options.address],
      )
      .send(managerTxOpts);

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

    exchangeIndex = 0;

    const makeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );
    await fund.policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        priceTolerance.options.address,
      )
      .send(managerTxOpts);

    const takeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );
    await fund.policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        priceTolerance.options.address
      )
      .send(managerTxOpts);

    const requestInvestmentFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.PARTICIPATION,
      'requestInvestment',
    );
    await fund.policyManager.methods
      .register(
        encodeFunctionSignature(requestInvestmentFunctionSig),
        userWhitelist.options.address
      )
      .send(managerTxOpts);
  });

  test('Request investment fails for whitelisted user with no allowance', async () => {
    const { participation } = fund;

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...defaultTxOpts, value: amguAmount }),
    ).rejects.toThrow();
  });

  test('Request investment fails for user not on whitelist', async () => {
    const { participation } = fund;

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...investorTxOpts, value: amguAmount }),
    ).rejects.toThrow('Rule evaluated to false: UserWhitelist');
  });

  test('Request investment succeeds for whitelisted user with allowance', async () => {
    const { participation, shares } = fund;

    await userWhitelist.methods.addToWhitelist(investor).send(defaultTxOpts);

    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const investorShares = await shares.methods.balanceOf(investor).call();

    expect(investorShares.toString()).toEqual(wantedShares.toString());
  });

  test('Fund can take an order on Oasis DEX', async () => {
    const { accounting, trading } = fund;

    const makerQuantity = toWei('2', 'ether');
    const makerAsset = mln.options.address;
    const takerQuantity = toWei('0.1', 'ether');
    const takerAsset = weth.options.address;

    await mln.methods
      .approve(oasisDex.options.address, makerQuantity)
      .send(defaultTxOpts);
    const res = await oasisDex.methods
      .offer(makerQuantity, makerAsset, takerQuantity, takerAsset, 0)
      .send(defaultTxOpts);

    const orderId = res.events.LogMake.returnValues.id;
    const takeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );

    const preMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call();
    const preWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderFunctionSig,
        [
          deployer,
          fund.trading.options.address,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        orderId,
        '0x0',
      )
      .send(managerTxOpts);

    const postMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call();
    const postWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call();

    expect(
      new BN(postMlnFundHoldings.toString()).eq(
        new BN(preMlnFundHoldings.toString()).add(new BN(makerQuantity.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFundHoldings.toString()).eq(
        new BN(preWethFundHoldings.toString()).sub(new BN(takerQuantity.toString())),
      ),
    ).toBe(true);
  });

  test('Fund can make an order on Oasis DEX', async () => {
    const { accounting, trading } = fund;

    const makerQuantity = toWei('0.2', 'ether');
    const makerAsset = weth.options.address;
    const takerQuantity = toWei('4', 'ether');
    const takerAsset = mln.options.address;

    const makeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    const preMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call()
    const preWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call()

    const res = await trading.methods
      .callOnExchange(
        exchangeIndex,
        makeOrderFunctionSig,
        [
          fund.trading.options.address,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const logMake = getEventFromReceipt(
      res.events,
      CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
      'LogMake'
    );
    const orderId = hexToNumber(logMake.id);

    await mln.methods
      .approve(oasisDex.options.address, takerQuantity)
      .send(defaultTxOpts);

    await oasisDex.methods
      .buy(orderId, makerQuantity)
      .send(defaultTxOpts);

    const postMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call()
    const postWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call()

    expect(
      new BN(postMlnFundHoldings.toString()).eq(
        new BN(preMlnFundHoldings.toString()).add(new BN(takerQuantity.toString()))
      )
    ).toBe(true);
    expect(
      new BN(postWethFundHoldings.toString()).eq(
        new BN(preWethFundHoldings.toString()).sub(new BN(makerQuantity.toString()))
      )
    ).toBe(true);
  });

  // TODO - redeem shares?

  // TODO - calculate fees?

  test('Cannot invest in a shutdown fund', async () => {
    const { participation } = fund;

    await version.methods.shutDownFund(fund.hub.options.address).send(managerTxOpts);

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...investorTxOpts, value: amguAmount }),
    ).rejects.toThrow('Hub is shut down');
  });
});
