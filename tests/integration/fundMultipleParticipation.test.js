/*
 * @file Tests multiple participations in a fund from multiple investors
 *
 * @test A user can only have 1 pending investment at a time
 * @test A second user can simultaneously invest (with a second default token)
 * @test A third user can simultaneously invest (with a newly approved token)
 * @test Multiple pending investment requests can all be exectuted
 * @test Request can be executed through Engine, burning MLN
 */

import web3 from '~/deploy/utils/get-web3';
import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { BNExpMul } from '~/tests/utils/BNmath';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { delay } from '~/tests/utils/time';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor1, investor2, investor3;
let defaultTxOpts, managerTxOpts;
let investor1TxOpts, investor2TxOpts, investor3TxOpts;

beforeAll(async () => {
  [
    deployer,
    manager,
    investor1,
    investor2,
    investor3
  ] = await getAccounts();

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investor1TxOpts = { ...defaultTxOpts, from: investor1 };
  investor2TxOpts = { ...defaultTxOpts, from: investor2 };
  investor3TxOpts = { ...defaultTxOpts, from: investor3 };
});

describe('Fund 1: Multiple investors buying shares with different tokens', () => {
  let amguAmount, shareSlippageTolerance;
  let wantedShares1, wantedShares2, wantedShares3, wantedShares4;
  let daiToEthRate, mlnToEthRate, wethToEthRate;
  let dai, mln, priceSource, weth;
  let registry, fund, engine, engineAdapter;
  let executeRequestAndBurnMlnSig;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;
    registry = contracts[CONTRACT_NAMES.REGISTRY];
    engine = contracts[CONTRACT_NAMES.ENGINE];
    engineAdapter = contracts[CONTRACT_NAMES.ENGINE_ADAPTER];
    dai = contracts.DAI;
    mln = contracts.MLN;
    weth = contracts.WETH;
    priceSource = contracts.TestingPriceFeed;
    const version = contracts.Version;

    executeRequestAndBurnMlnSig = getFunctionSignature(
      CONTRACT_NAMES.ENGINE_ADAPTER,
      'executeRequestAndBurnMln',
    );

    // Set initial prices to be predictably the same as prices when updated again later
    wethToEthRate = toWei('1', 'ether');
    mlnToEthRate = toWei('0.5', 'ether');
    daiToEthRate = toWei('0.005', 'ether');
    await send(
      priceSource,
      'update',
      [
        [weth.options.address, mln.options.address, dai.options.address],
        [wethToEthRate, mlnToEthRate, daiToEthRate],
      ],
      defaultTxOpts
    );

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      exchanges: [engine.options.address],
      exchangeAdapters: [engineAdapter.options.address],
      manager,
      quoteToken: weth.options.address,
      version
    });

    amguAmount = toWei('.01', 'ether');
    wantedShares1 = toWei('1', 'ether');
    wantedShares2 = toWei('2', 'ether');
    wantedShares3 = toWei('1.5', 'ether');
    wantedShares4 = toWei('0.5', 'ether');
    shareSlippageTolerance = new BN(toWei('0.0001', 'ether')); // 0.01%
  });

  test('A user can have only one pending investment request', async () => {
    const { accounting, participation } = fund;

    const offerAsset = weth.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares1, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      weth,
      'approve',
      [participation.options.address, offerAssetMaxQuantity],
      investor1TxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares1, offerAssetMaxQuantity, weth.options.address],
      { ...investor1TxOpts, value: amguAmount }
    );

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      weth,
      'approve',
      [participation.options.address, offerAssetMaxQuantity],
      investor1TxOpts
    );
    await expect(
      send(
        participation,
        'requestInvestment',
        [wantedShares1, offerAssetMaxQuantity, offerAsset],
        { ...investor1TxOpts, value: amguAmount }
      )
    ).rejects.toThrowFlexible('Only one request can exist at a time');
  });

  test('Investment request allowed for second user with another default token', async () => {
    const { accounting, participation } = fund;

    const offerAsset = mln.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares2, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 2 - mln
    await send(mln, 'transfer', [investor2, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      mln,
      'approve',
      [participation.options.address, offerAssetMaxQuantity],
      investor2TxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares2, offerAssetMaxQuantity, offerAsset],
      { ...investor2TxOpts, value: amguAmount }
    );
  });

  test('Investment request allowed for third user with approved token', async () => {
    const { accounting, participation } = fund;

    const offerAsset = dai.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares3, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 3 - dai
    await send(dai, 'transfer', [investor3, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      dai,
      'approve',
      [participation.options.address, offerAssetMaxQuantity],
      investor3TxOpts
    );

    // Investment asset must be enabled
    await expect(
      send(
        participation,
        'requestInvestment',
        [wantedShares3, offerAssetMaxQuantity, offerAsset],
        { ...investor3TxOpts, value: amguAmount }
      )
    ).rejects.toThrowFlexible("Investment not allowed in this asset");

    await send(participation, 'enableInvestment', [[offerAsset]], managerTxOpts);

    await send(
      participation,
      'requestInvestment',
      [wantedShares3, offerAssetMaxQuantity, offerAsset],
      { ...investor3TxOpts, value: amguAmount }
    )
  });

  test('Multiple pending investments can be executed', async () => {
    const { participation, shares } = fund;

    // Need price update before participation executed
    await delay(1000);

    await send(
      priceSource,
      'update',
      [
        [weth.options.address, mln.options.address, dai.options.address],
        [wethToEthRate, mlnToEthRate, daiToEthRate],
      ],
      defaultTxOpts
    );

    await send(
      participation,
      'executeRequest',
      [],
      investor1TxOpts
    );
    const investor1Shares = await call(shares, 'balanceOf', [investor1]);
    expect(investor1Shares).toEqual(wantedShares1);

    await send(
      participation,
      'executeRequest',
      [],
      investor2TxOpts
    );
    const investor2Shares = await call(shares, 'balanceOf', [investor2]);
    expect(investor2Shares).toEqual(wantedShares2);

    await send(
      participation,
      'executeRequest',
      [],
      investor3TxOpts
    );
    const investor3Shares = await call(shares, 'balanceOf', [investor3]);
    expect(investor3Shares).toEqual(wantedShares3);
  });

  test('Investment request allowed after previous user request was executed', async () => {
    const { accounting, participation } = fund;

    const offerAsset = weth.options.address;
    const expectedOfferAssetCost = new BN(
      await call(
        accounting,
        'getShareCostInAsset',
        [wantedShares1, offerAsset]
      )
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 1 - weth
    await send(weth, 'transfer', [investor1, offerAssetMaxQuantity], defaultTxOpts);
    await send(
      weth,
      'approve',
      [participation.options.address, offerAssetMaxQuantity],
      investor1TxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares4, offerAssetMaxQuantity, weth.options.address],
      { ...investor1TxOpts, value: amguAmount }
    );
  });

  test('Request can be executed through Engine, burning MLN', async () => {
    const { accounting, participation, shares, trading } = fund;

    const preInvestor1Shares = new BN(await call(shares, 'balanceOf', [investor1]));
    const preMlnTotalSupply = new BN(await call(mln, 'totalSupply'));
    const preFundMln = new BN(await call(accounting, 'assetHoldings', [mln.options.address]));
    const preParticipationEth = new BN(await web3.eth.getBalance(participation.options.address));

    // Need price update before participation executed
    await delay(1000);

    await send(
      priceSource,
      'update',
      [
        [weth.options.address, mln.options.address, dai.options.address],
        [wethToEthRate, mlnToEthRate, daiToEthRate],
      ],
      defaultTxOpts
    );

    // Unauthorized address cannot call executeRequestFor
    await expect(
      send(
        participation,
        'executeRequestFor',
        [investor1],
        investor2TxOpts
    )).rejects.toThrowFlexible("This can only be called through the Engine");

    await expect(
      send(
        engine,
        'executeRequestAndBurnMln',
        [participation.options.address, investor1],
        { from: investor2, gas: 8000000 }
    )).rejects.toThrowFlexible();

    const incentiveAmount = new BN(await call(registry, 'incentive'));
    const mlnAmount = new BN(
      await call(engine, 'mlnRequiredForIncentiveAmount', [incentiveAmount.toString()])
    );

    // Get Engine exchangeIndex
    const exchangeInfo = await call(trading, 'getExchangeInfo');
    const exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === engineAdapter.options.address.toLowerCase(),
    );

    // TODO: test request execution with incorrect params (too little/ too much MLN and ETH)
    const receipt = await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        executeRequestAndBurnMlnSig,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          participation.options.address,
          investor1
        ],
        [incentiveAmount.toString(), mlnAmount.toString(), 0, 0, 0, 0, mlnAmount.toString(), 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0',
      ],
      managerTxOpts
    );

    const event = getEventFromLogs(
      receipt.logs, CONTRACT_NAMES.ENGINE, 'RequestExecutedForIncentive'
    );

    const postInvestor1Shares = new BN(await call(shares, 'balanceOf', [investor1]));
    const postMlnTotalSupply = new BN(await call(mln, 'totalSupply'));
    const postFundMln = new BN(await call(accounting, 'assetHoldings', [mln.options.address]));
    const postParticipationEth = new BN(await web3.eth.getBalance(participation.options.address));

    expect(postMlnTotalSupply).bigNumberEq(preMlnTotalSupply.sub(mlnAmount));
    expect(postFundMln).bigNumberEq(preFundMln.sub(mlnAmount));
    expect(postParticipationEth).bigNumberEq(preParticipationEth.sub(incentiveAmount));
    expect(postInvestor1Shares).bigNumberEq(new BN(preInvestor1Shares).add(new BN(wantedShares4)));
    expect(event.participationContract.toLowerCase()).toBe(participation.options.address.toLowerCase());
    expect(event.requestOwner.toLowerCase()).toBe(investor1.toLowerCase());
    expect(new BN(event.incentiveAmount)).bigNumberEq(incentiveAmount);
  });
});
