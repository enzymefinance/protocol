/*
 * @file Tests fund's ability to handle a malicious ERC20 token that attempts denial of service
 *
 * @test Fund receives WETH via investor participation
 * @test Redeem fails when malicious token is present
 * @test redeemWithConstraints succeeds to withdraw specific assets only
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { increaseTime } from '~/tests/utils/rpc';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

describe('fund-malicious-token', () => {
  let accounts;
  let defaultTxOpts, investorTxOpts, managerTxOpts;
  let deployer, manager, investor;
  let contracts, deployOut;
  let fund, weth, mln, registry, version, maliciousToken;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    contracts = deployed.contracts;
    deployOut = deployed.deployOut;
    weth = contracts.WETH;
    mln = contracts.MLN;
    registry = contracts.Registry;
    version = contracts.Version;

    maliciousToken = await deploy(
      CONTRACT_NAMES.MALICIOUS_TOKEN,
      ['MLC', 18, 'Malicious']
    );

    await contracts.TestingPriceFeed.methods.setDecimals(
      maliciousToken.options.address, 18
    ).send(defaultTxOpts);

    await registry.methods
      .registerAsset(
        maliciousToken.options.address.toLowerCase(),
        'Malicious',
        'MLC',
        '',
        0,
        [],
        [],
      )
      .send(defaultTxOpts);

    await version.methods
      .beginSetup(
        stringToBytes('Test fund', 32),
        [],
        [],
        [],
        [],
        [],
        weth.options.address.toString(),
        [
          mln.options.address.toString(),
          weth.options.address.toString(),
          maliciousToken.options.address.toString(),
        ],
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
    await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));

    // Seed investor with weth and maliciousToken
    await weth.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);
    await maliciousToken.methods
      .transfer(investor, toWei('10', 'ether'))
      .send(defaultTxOpts);
  });

  test('fund receives ETH from investment', async () => {
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

  test(`General redeem fails in presence of malicious token`, async () => {
    const { participation } = fund;

    const amguAmount = toWei('.01', 'ether');
    const dummyAmount = toWei('1', 'ether');

    await maliciousToken.methods
      .approve(fund.participation.options.address, dummyAmount)
      .send(investorTxOpts);
    await fund.participation.methods
      .requestInvestment(dummyAmount, dummyAmount, maliciousToken.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    await increaseTime(5); // to avoid executing in same block as update

    await contracts.TestingPriceFeed.methods
      .update([weth.options.address, maliciousToken.options.address],
      [toWei('1', 'ether'), toWei('1', 'ether')]
    ).send(defaultTxOpts);

    await fund.participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    await contracts.TestingPriceFeed.methods
      .update([weth.options.address, maliciousToken.options.address],
      [toWei('1', 'ether'), toWei('1', 'ether')]
    ).send(defaultTxOpts);

    await maliciousToken.methods.startReverting().send(defaultTxOpts);

    await expect(
      participation.methods.redeem().send(investorTxOpts),
    ).rejects.toThrow();
  });

  test(`Redeem with constraints works as expected`, async () => {
    const { accounting, participation, shares, vault } = fund;

    const valueOfMaliciousToken = toWei('1', 'ether');

    const preMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const preMlnInvestor = await mln.methods.balanceOf(investor).call();
    const preWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const investorShares = await shares.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await participation.methods
      .redeemWithConstraints(investorShares, [weth.options.address])
      .send(investorTxOpts);

    const postMlnFund = await mln.methods
      .balanceOf(vault.options.address)
      .call();
    const postMlnInvestor = await mln.methods.balanceOf(investor).call();
    const postWethFund = await weth.methods
      .balanceOf(vault.options.address)
      .call();
    const postMaliciousTokenFund = await maliciousToken.methods
      .balanceOf(vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    expect(new BN(postTotalSupply.toString()))
      .bigNumberEq(new BN(preTotalSupply.toString()).sub(new BN(investorShares.toString())));
      expect(new BN(postWethInvestor.toString()))
        .bigNumberEq(new BN(preWethInvestor.toString()).add(new BN(preWethFund.toString())));
    expect(new BN(postWethFund.toString())).bigNumberEq(new BN(0));
    expect(postMlnFund).toEqual(preMlnFund);
    expect(postMlnInvestor).toEqual(preMlnInvestor);
    expect(new BN(postFundGav.toString()).toString()).toBe(new BN(valueOfMaliciousToken.toString()).toString());
  });
});
