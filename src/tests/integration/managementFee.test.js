import { BN, padLeft, stringToHex, toWei } from 'web3-utils';
import { getUpdatedTestPrices } from '../utils/new/api';
import { BNExpMul } from '../utils/new/BNmath';
import { CONTRACT_NAMES } from '../utils/new/constants';
const getFundComponents = require('../utils/new/getFundComponents');
const updateTestingPriceFeed = require('../utils/new/updateTestingPriceFeed');
const {increaseTime, mine} = require('../utils/new/rpc');
const web3 = require('../../../deploy/utils/get-web3');
const deploySystem = require('../../../deploy/scripts/deploy-system');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
import { stringToBytes } from '../utils/new/formatting';

describe('management-fee', () => {
  const yearInSeconds = 31536000;
  let deployer, manager, investor;
  let defaultTxOpts, managerTxOpts, investorTxOpts;
  let addresses, contracts, deployOut;
  let managementFeeRate;
  let managementFee, registry, version, mln, priceSource, weth, fund;
  let deployed;

  beforeAll(async () => {
    [deployer, manager, investor] = await web3.eth.getAccounts();
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const deployed = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    deployOut = deployed.deployOut;
    contracts = deployed.contracts;

    weth = contracts.WETH;
    mln = contracts.MLN;
    managementFee = contracts.ManagementFee;
    registry = contracts.Registry;
    version = contracts.Version;
    priceSource = contracts.TestingPriceFeed;

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
    // const hub = getContract(environment, CONTRACT_NAMES.HUB, hubAddress);
    // const routes = await hub.methods.routes().call();
    // contracts.fund = {
    //   accounting: getContract(
    //     environment,
    //     CONTRACT_NAMES.ACCOUNTING,
    //     routes.accounting,
    //   ),
    //   feeManager: getContract(
    //     environment,
    //     CONTRACT_NAMES.FEE_MANAGER,
    //     routes.feeManager,
    //   ),
    //   participation: getContract(
    //     environment,
    //     CONTRACT_NAMES.PARTICIPATION,
    //     routes.participation,
    //   ),
    //   shares: getContract(environment, CONTRACT_NAMES.SHARES, routes.shares),
    // };
    // addresses.fund = routes;

    await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));
  });

  test(`fund gets ethToken from investment`, async () => {
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

  test(`Reward fee rewards management fee in the form of shares`, async () => {
    const { accounting, feeManager, shares } = fund;

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

  // TODO: not passing for some reason (time-based?)
  test(`Claims fee using triggerRewardAllFees`, async () => {
    const { accounting, feeManager, shares } = fund;

    const lastFeeConversion = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();

    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethManager = await weth.methods.balanceOf(manager).call();
    const preManagerShares = await shares.methods.balanceOf(manager).call();
    const preTotalSupply = await shares.methods.totalSupply().call();
    await mine();
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
    expect(postFundCalcs.sharePrice.toString()).toEqual(preFundCalcs.sharePrice.toString());
    expect(new BN(postWethFund.toString()).eq(new BN(preWethFund.toString()))).toBe(true);
    expect(new BN(postWethManager.toString()).eq(new BN(preWethManager.toString()))).toBe(true);

    // NB: this assertion is kind of shaky
    // It depends on performCalculations and triggerRewardAllFees being called in the same second
    expect(
      new BN(preFundCalcs.feesInDenominationAsset.toString()).eq(
        expectedFeeInDenominationAsset,
      ),
    ).toBe(true);
    expect(
      new BN(lastConversionCalculations.allocatedFees.toString()).eq(
        expectedFeeInDenominationAsset,
      ),
    ).toBe(true);
  });

  test(`investor redeems his shares`, async () => {
    const {
      accounting,
      feeManager,
      participation,
      shares,
      vault,
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
    const preFundGav = await accounting.methods.calcGav().call();

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
});
