/*
 * @file Tests how setting a managementFee affects a fund
 *
 * @test The rewardManagementFee function distributes management fee shares to the manager
 * @test The triggerRewardAllFees function distributes all fee shares to the manager
 * @test An investor can still redeem their shares for the expected value
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul, BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';
import { increaseTime, mine } from '~/tests/utils/rpc';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

describe('management-fee', () => {
  const yearInSeconds = 31536000;
  let deployer, manager, investor;
  let defaultTxOpts, managerTxOpts, investorTxOpts;
  let contracts, deployOut;
  let managementFeeRate;
  let managementFee, registry, version, mln, weth, fund;

  beforeAll(async () => {
    [deployer, manager, investor] = await web3.eth.getAccounts();
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
    deployOut = deployed.deployOut;
    contracts = deployed.contracts;

    weth = contracts.WETH;
    mln = contracts.MLN;
    managementFee = contracts.ManagementFee;
    registry = contracts.Registry;
    version = contracts.Version;

    const managementFeePeriod = 0;
    managementFeeRate = toWei('0.02', 'ether');

    await registry.methods
      .registerFees([managementFee.options.address.toString()])
      .send(defaultTxOpts);

    const fundName = stringToBytes('Test fund', 32);
    await version.methods
      .beginSetup(
        fundName,
        [managementFee.options.address.toString()],
        [managementFeeRate],
        [managementFeePeriod],
        [],
        [],
        weth.options.address.toString(),
        [weth.options.address.toString(), mln.options.address.toString()],
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
  });

  test('Fund gets ethToken from investment', async () => {
    const { participation, shares } = fund;
    const offeredValue = toWei('100', 'ether');
    const wantedShares = toWei('100', 'ether');
    const amguAmount = toWei('.01', 'ether');

    await weth.methods.transfer(investor, offeredValue).send(defaultTxOpts);

    const preTotalSupply = await shares.methods.totalSupply().call();
    await weth.methods
      .approve(participation.options.address, wantedShares)
      .send(investorTxOpts);
    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postTotalSupply = await shares.methods.totalSupply().call();
    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(wantedShares.toString())),
      ),
    ).toBe(true);
  });

  test('executing rewardManagementFee distributes management fee shares to manager', async () => {
    const { accounting, feeManager, shares } = fund;

    const ONE_DAY = 86400;
    await increaseTime(ONE_DAY);

    const fundCreationTime = new BN(
      (await managementFee.methods.lastPayoutTime(feeManager.options.address).call()).toString()
    );

    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethManager = await weth.methods.balanceOf(manager).call();
    const preManagerShares = await shares.methods.balanceOf(manager).call();
    const preTotalSupply = await shares.methods.totalSupply().call();
    const preFundGav = await accounting.methods.calcGav().call();

    await feeManager.methods.rewardManagementFee().send(managerTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethManager = await weth.methods.balanceOf(manager).call();
    const postManagerShares = await shares.methods.balanceOf(manager).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    const payoutTime = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();
    const expectedPreDilutionFeeShares = BNExpMul(
      new BN(preTotalSupply.toString()),
      new BN(managementFeeRate.toString()),
    )
      .mul(new BN(payoutTime.toString()).sub(new BN(fundCreationTime.toString())))
      .div(new BN(yearInSeconds.toString()));

    const expectedFeeShares = new BN(preTotalSupply.toString())
      .mul(new BN(expectedPreDilutionFeeShares.toString()))
      .div(new BN(preTotalSupply.toString()).sub(new BN(expectedPreDilutionFeeShares.toString())));

    expect(
      new BN(postManagerShares.toString()).eq(
        new BN(preManagerShares.toString()).add(new BN(expectedFeeShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(expectedFeeShares.toString())),
      ),
    ).toBe(true);
    expect(new BN(postFundGav.toString()).eq(new BN(preFundGav.toString()))).toBe(true);
    // Find out a way to assert this
    // Share price is supposed to change due to time difference (keep constant)
    // expect(postFundCalculations.sharePrice).toEqual(
    //   preFundCalculations.sharePrice,
    // );
    expect(new BN(postWethFund.toString()).eq(new BN(preWethFund.toString()))).toBe(true);
    expect(new BN(postWethManager.toString()).eq(new BN(preWethManager.toString()))).toBe(true);
  });

  test('executing triggerRewardAllFees distributes fee shares to manager', async () => {
    const { accounting, feeManager, shares } = fund;

    await mine();
    const lastFeeConversion = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethManager = await weth.methods.balanceOf(manager).call();
    const preManagerShares = await shares.methods.balanceOf(manager).call();
    const preTotalSupply = await shares.methods.totalSupply().call();
    const preFundCalcs = await accounting.methods.performCalculations().call();

    await accounting.methods.triggerRewardAllFees().send(managerTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethManager = await weth.methods.balanceOf(manager).call();
    const postManagerShares = await shares.methods.balanceOf(manager).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundCalcs = await accounting.methods.performCalculations().call();

    const lastConversionCalculations = await accounting.methods
      .atLastAllocation()
      .call();
    const payoutTime = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();
    const expectedPreDilutionFeeShares = BNExpMul(
      new BN(preTotalSupply.toString()),
      new BN(managementFeeRate.toString()),
    )
      .mul(new BN(payoutTime.toString()).sub(new BN(lastFeeConversion.toString())))
      .div(new BN(yearInSeconds.toString()));
    const expectedFeeShares = new BN(preTotalSupply.toString())
      .mul(new BN(expectedPreDilutionFeeShares.toString()))
      .div(new BN(preTotalSupply.toString()).sub(new BN(expectedPreDilutionFeeShares.toString())));
    const expectedFeeInDenominationAsset = new BN(expectedFeeShares.toString())
      .mul(new BN(preFundCalcs.gav.toString()))
      .div(new BN(preTotalSupply.toString()).add(new BN(expectedFeeShares.toString())));

    expect(
      new BN(postManagerShares.toString()).eq(
        new BN(preManagerShares.toString()).add(new BN(expectedFeeShares.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString()).add(new BN(expectedFeeShares.toString())),
      ),
    ).toBe(true);
    expect(new BN(postFundCalcs.gav.toString()).eq(new BN(preFundCalcs.gav.toString()))).toBe(true);
    expect(BNExpDiv(
      new BN(preFundCalcs.nav), new BN(preTotalSupply)
    ).toString()).toEqual(
      new BN(preFundCalcs.sharePrice).toString()
    );
    expect(BNExpDiv(
      new BN(postFundCalcs.nav), new BN(postTotalSupply)
    ).toString()).toEqual(
      new BN(postFundCalcs.sharePrice).toString()
    );
    expect(new BN(postWethFund.toString()).eq(new BN(preWethFund.toString()))).toBe(true);
    expect(new BN(postWethManager.toString()).eq(new BN(preWethManager.toString()))).toBe(true);
    expect(
      new BN(lastConversionCalculations.allocatedFees.toString()).eq(
        expectedFeeInDenominationAsset,
      ),
    ).toBe(true);
  });

  test('Investor redeems his shares', async () => {
    const {
      accounting,
      feeManager,
      participation,
      shares
    } = fund;

    const investorShares = await shares.methods.balanceOf(investor).call();
    const lastFeeConversion = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();

    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();

    await increaseTime(1000);
    await participation.methods.redeem().send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    const payoutTime = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();
    const expectedPreDilutionFeeShares = BNExpMul(
      new BN(preTotalSupply.toString()),
      new BN(managementFeeRate.toString()),
    )
      .mul(new BN(payoutTime.toString()).sub(new BN(lastFeeConversion.toString())))
      .div(new BN(yearInSeconds.toString()));
    const expectedFeeShares = new BN(preTotalSupply.toString())
      .mul(new BN(expectedPreDilutionFeeShares.toString()))
      .div(new BN(preTotalSupply.toString()).sub(new BN(expectedPreDilutionFeeShares.toString())));

    expect(
      new BN(postTotalSupply.toString()).eq(
        new BN(preTotalSupply.toString())
          .sub(new BN(investorShares.toString()))
          .add(expectedFeeShares),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor.toString()).eq(
        new BN(preWethFund.toString())
          .mul(new BN(investorShares.toString()))
          .div(new BN(preTotalSupply.toString()).add(expectedFeeShares))
          .add(new BN(preWethInvestor.toString())),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund.toString()).eq(
        new BN(preWethFund.toString()).sub(
          new BN(postWethInvestor.toString()).sub(new BN(preWethInvestor.toString())),
        ),
      ),
    ).toBe(true);
    expect(new BN(postFundGav.toString()).eq(new BN(postWethFund.toString()))).toBe(true);
  });

  test('Manager redeems his shares', async () => {
    const {
      participation,
      shares
    } = fund;

    const preManagerShares = await shares.methods.balanceOf(manager).call();
    expect(preManagerShares).not.toBe('0');

    await increaseTime(1000);
    await participation.methods.redeem().send(managerTxOpts);

    const postManagerShares = await shares.methods.balanceOf(manager).call();
    expect(postManagerShares).toBe('0');
  });
});
