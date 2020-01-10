/*
 * @file Tests multiple participations in a fund from multiple investors
 *
 * @test A user can only have 1 pending investment at a time
 * @test A second user can simultaneously invest (with a second default token)
 * @test A third user can simultaneously invest (with a newly approved token)
 * @test Multiple pending investment requests can all be exectuted
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { BNExpMul } from '~/tests/utils/BNmath';
import { increaseTime } from '~/tests/utils/rpc';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';

let deployer, manager, investor1, investor2, investor3;
let defaultTxOpts, managerTxOpts;
let investor1TxOpts, investor2TxOpts, investor3TxOpts;
let daiToEthRate, mlnToEthRate, wethToEthRate;
let dai, mln, priceSource, weth
let contracts;
let accounting, participation, shares;

beforeAll(async () => {
  [
    deployer,
    manager,
    investor1,
    investor2,
    investor3
  ] = await web3.eth.getAccounts();

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investor1TxOpts = { ...defaultTxOpts, from: investor1 };
  investor2TxOpts = { ...defaultTxOpts, from: investor2 };
  investor3TxOpts = { ...defaultTxOpts, from: investor3 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;
  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;

  // Set initial prices to be predictably the same as prices when updated again later
  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  daiToEthRate = toWei('0.005', 'ether');

  await priceSource.methods
    .update(
      [weth.options.address, mln.options.address, dai.options.address],
      [wethToEthRate, mlnToEthRate, daiToEthRate],
    )
    .send(defaultTxOpts);

  await weth.methods.transfer(manager, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor1, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor2, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor3, toWei('10', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(manager, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor1, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor2, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor3, toWei('20', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(manager, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor1, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor2, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor3, toWei('2000', 'ether')).send(defaultTxOpts);
});

describe('Fund 1: Multiple investors buying shares with different tokens', () => {
  let amguAmount, shareSlippageTolerance;
  let wantedShares1, wantedShares2, wantedShares3;

  beforeAll(async () => {
    const fund = await setupInvestedTestFund(contracts, manager);
    accounting = fund.accounting;
    participation = fund.participation;
    shares = fund.shares;

    amguAmount = toWei('.01', 'ether');
    wantedShares1 = toWei('1', 'ether');
    wantedShares2 = toWei('2', 'ether');
    wantedShares3 = toWei('1.5', 'ether');
    shareSlippageTolerance = new BN(toWei('0.0001', 'ether')); // 0.01%
  });

  test('A user can have only one pending investment request', async () => {
    const offerAsset = weth.options.address;
    const expectedOfferAssetCost = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares1, offerAsset)
        .call()
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 1 - weth
    await weth.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor1TxOpts);
    await participation.methods
      .requestInvestment(wantedShares1, offerAssetMaxQuantity, offerAsset)
      .send({ ...investor1TxOpts, value: amguAmount });

    // Investor 1 - weth
    await weth.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor1TxOpts);
    await expect(
      participation.methods
        .requestInvestment(wantedShares1, offerAssetMaxQuantity, offerAsset)
        .send({ ...investor1TxOpts, value: amguAmount })
    ).rejects.toThrow('Only one request can exist at a time');
  });

  test('Investment request allowed for second user with another default token', async () => {
    const offerAsset = mln.options.address;
    const expectedOfferAssetCost = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares2, offerAsset)
        .call()
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 2 - mln
    await mln.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor2TxOpts);
    await participation.methods
      .requestInvestment(wantedShares2, offerAssetMaxQuantity, offerAsset)
      .send({ ...investor2TxOpts, value: amguAmount });
  });

  test('Investment request allowed for third user with approved token', async () => {
    const offerAsset = dai.options.address;
    const expectedOfferAssetCost = new BN(
      await accounting.methods
        .getShareCostInAsset(wantedShares3, offerAsset)
        .call()
    );
    const offerAssetMaxQuantity = BNExpMul(
      expectedOfferAssetCost,
      new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
    ).toString();

    // Investor 3 - dai
    await dai.methods
      .approve(participation.options.address, offerAssetMaxQuantity)
      .send(investor3TxOpts);
    await expect(
      participation.methods
        .requestInvestment(wantedShares3, offerAssetMaxQuantity, offerAsset)
        .send({ ...investor3TxOpts, value: amguAmount })
    ).rejects.toThrow('Investment not allowed in this asset');

    await participation.methods
      .enableInvestment([offerAsset])
      .send(managerTxOpts);

    await participation.methods
      .requestInvestment(wantedShares3, offerAssetMaxQuantity, offerAsset)
      .send({ ...investor3TxOpts, value: amguAmount });
  });

  test('Multiple pending investments can be executed', async () => {
    // Need price update before participation executed
    await increaseTime(30);
    await priceSource.methods
      .update(
        [weth.options.address, mln.options.address, dai.options.address],
        [wethToEthRate, mlnToEthRate, daiToEthRate],
      )
      .send(defaultTxOpts);

    await participation.methods
      .executeRequestFor(investor1)
      .send(investor1TxOpts);
    const investor1Shares = await shares.methods.balanceOf(investor1).call();
    expect(investor1Shares).toEqual(wantedShares1);

    await participation.methods
      .executeRequestFor(investor2)
      .send(investor2TxOpts);
    const investor2Shares = await shares.methods.balanceOf(investor2).call();
    expect(investor2Shares).toEqual(wantedShares2);

    await participation.methods
      .executeRequestFor(investor3)
      .send(investor3TxOpts);
    const investor3Shares = await shares.methods.balanceOf(investor3).call();
    expect(investor3Shares).toEqual(wantedShares3);
  });
});
