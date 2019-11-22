import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, hexToNumber, toWei } from 'web3-utils';

import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { getContract } from '~/utils/solidity/getContract';

import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  EXCHANGES,
  TRACKS,
} from '../utils/new/constants';
import { stringToBytes } from '../utils/new/formatting';
import {
  getEventFromReceipt,
  getFunctionSignature
} from '../utils/new/metadata';

describe('general-walkthrough', () => {
  let environment;
  let deployer, manager, investor;
  let defaultTxOpts, managerTxOpts, investorTxOpts;
  let addresses, contracts;
  let exchangeIndex;
  let offeredValue, wantedShares, amguAmount;
  let order;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    expect(environment.track).toBe(TRACKS.TESTING);

    [deployer, manager, investor] = await environment.eth.getAccounts();
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    addresses = environment.deployment;
    const [wethTokenInfo, mlnTokenInfo] = addresses.thirdPartyContracts.tokens;
    const OasisDEXAddresses = addresses.exchangeConfigs[EXCHANGES.OASIS_DEX];

    const mln = getContract(
      environment,
      CONTRACT_NAMES.STANDARD_TOKEN,
      mlnTokenInfo.address,
    );
    const weth = getContract(
      environment,
      CONTRACT_NAMES.WETH,
      wethTokenInfo.address,
    );
    const engine = getContract(
      environment,
      CONTRACT_NAMES.ENGINE,
      addresses.melonContracts.engine,
    );
    const version = getContract(
      environment,
      CONTRACT_NAMES.VERSION,
      addresses.melonContracts.version,
    );
    const oasisDEX = getContract(
      environment,
      CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
      OasisDEXAddresses.exchange,
    );
    const priceSource = getContract(
      environment,
      CONTRACT_NAMES.TESTING_PRICEFEED,
      addresses.melonContracts.priceSource,
    );
    const userWhitelist = getContract(
      environment,
      CONTRACT_NAMES.USER_WHITELIST,
      addresses.melonContracts.policies.userWhitelist,
    );
    contracts = {
      engine,
      version,
      mln,
      oasisDEX,
      priceSource,
      userWhitelist,
      weth,
    };

    offeredValue = toWei('1', 'ether');
    wantedShares = toWei('1', 'ether');
    amguAmount = toWei('.01', 'ether');
    order = {
      makerQuantity: toWei('0.1', 'ether'),
      makerAsset: weth.options.address,
      takerQuantity: toWei('2', 'ether'),
      takerAsset: mln.options.address,
    };

    await weth.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);
    await mln.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);

    // const amguPrice = toWei('1', 'gwei');
    // await engine.methods.setAmguPrice(amguPrice).send(defaultTxOpts);

    await priceSource.methods
      .update(
        [wethTokenInfo.address, mlnTokenInfo.address],
        [toWei('1', 'ether'), toWei('0.5', 'ether')],
      )
      .send(defaultTxOpts);

    const fees = {
      contracts: [
        addresses.melonContracts.fees.managementFee.toString(),
        addresses.melonContracts.fees.performanceFee.toString(),
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
        [OasisDEXAddresses.exchange.toString()],
        [OasisDEXAddresses.adapter.toString()],
        wethTokenInfo.address.toString(),
        [wethTokenInfo.address.toString(), mlnTokenInfo.address.toString()],
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
    const hub = getContract(environment, CONTRACT_NAMES.HUB, hubAddress);
    const routes = await hub.methods.routes().call();

    addresses.fund = { ...routes, hub: hubAddress };
    contracts.fund = {
      accounting: getContract(
        environment,
        CONTRACT_NAMES.ACCOUNTING,
        routes.accounting,
      ),
      participation: getContract(
        environment,
        CONTRACT_NAMES.PARTICIPATION,
        routes.participation,
      ),
      policyManager: getContract(
        environment,
        CONTRACT_NAMES.POLICY_MANAGER,
        routes.policyManager,
      ),
      shares: getContract(environment, CONTRACT_NAMES.SHARES, routes.shares),
      trading: getContract(environment, CONTRACT_NAMES.TRADING, routes.trading),
    };
    const { policyManager, trading } = contracts.fund;

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === OasisDEXAddresses.adapter.toLowerCase(),
    );

    const makeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );
    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        addresses.melonContracts.policies.priceTolerance.toString(),
      )
      .send(managerTxOpts);

    const takeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        addresses.melonContracts.policies.priceTolerance.toString(),
      )
      .send(managerTxOpts);

    const requestInvestmentFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.PARTICIPATION,
      'requestInvestment',
    );
    await policyManager.methods
      .register(
        encodeFunctionSignature(requestInvestmentFunctionSig),
        addresses.melonContracts.policies.userWhitelist.toString(),
      )
      .send(managerTxOpts);
  });

  test('Request investment fails for whitelisted user with no allowance', async () => {
    const { weth } = contracts;
    const { participation } = contracts.fund;

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...defaultTxOpts, value: amguAmount }),
    ).rejects.toThrow();
  });

  test('Request investment fails for user not on whitelist', async () => {
    const { weth } = contracts;
    const { participation } = contracts.fund;

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...investorTxOpts, value: amguAmount }),
    ).rejects.toThrow();
  });

  test('Request investment succeeds for whitelisted user with allowance', async () => {
    const { userWhitelist, weth } = contracts;
    const { participation, shares } = contracts.fund;

    await userWhitelist.methods.addToWhitelist(investor).send(defaultTxOpts);

    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const investorShares = await shares.methods.balanceOf(investor).call();

    expect(investorShares).toEqual(wantedShares);
  });

  test('Fund can take an order on Oasis DEX', async () => {
    const { oasisDEX, mln, weth } = contracts;
    const { accounting, trading } = contracts.fund;

    const makerQuantity = toWei('2', 'ether');
    const makerAsset = mln.options.address;
    const takerQuantity = toWei('0.1', 'ether');
    const takerAsset = weth.options.address;

    await mln.methods
      .approve(oasisDEX.options.address, makerQuantity)
      .send(defaultTxOpts);
    const res = await oasisDEX.methods
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
          addresses.fund.trading,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        orderId,
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
      )
      .send(managerTxOpts);

    const postMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call();
    const postWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call();

    expect(
      new BN(postMlnFundHoldings).eq(
        new BN(preMlnFundHoldings).add(new BN(makerQuantity)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFundHoldings).eq(
        new BN(preWethFundHoldings).sub(new BN(takerQuantity)),
      ),
    ).toBe(true);
  });

  test('Fund can make an order on Oasis DEX', async () => {
    const { oasisDEX, mln, weth } = contracts;
    const { accounting, trading } = contracts.fund;

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
          addresses.fund.trading,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
      )
      .send(managerTxOpts);

    const logMake = getEventFromReceipt(
      res.events,
      CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
      'LogMake'
    );
    const orderId = hexToNumber(logMake.id);

    await mln.methods
      .approve(oasisDEX.options.address, takerQuantity)
      .send(defaultTxOpts);

    await oasisDEX.methods
      .buy(orderId, makerQuantity)
      .send(defaultTxOpts);

    const postMlnFundHoldings = await accounting.methods
      .assetHoldings(mln.options.address)
      .call()
    const postWethFundHoldings = await accounting.methods
      .assetHoldings(weth.options.address)
      .call()

    expect(
      new BN(postMlnFundHoldings).eq(
        new BN(preMlnFundHoldings).add(new BN(takerQuantity))
      )
    ).toBe(true);
    expect(
      new BN(postWethFundHoldings).eq(
        new BN(preWethFundHoldings).sub(new BN(makerQuantity))
      )
    ).toBe(true);
  });

  // TODO - redeem shares?

  // TODO - calculate fees?

  test('Cannot invest in a shutdown fund', async () => {
    const { weth, version } = contracts;
    const { participation } = contracts.fund;

    await version.methods.shutDownFund(addresses.fund.hub).send(managerTxOpts);

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...investorTxOpts, value: amguAmount }),
    ).rejects.toThrow();
  });
});
