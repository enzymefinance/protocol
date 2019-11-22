import { BN, padLeft, stringToHex, toWei } from 'web3-utils';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';

import { getUpdatedTestPrices } from '../utils/new/api';
import { BNExpMul } from '../utils/new/BNmath';
import { CONTRACT_NAMES } from '../utils/new/constants';

describe('management-fee', () => {
  const yearInSeconds = 31536000;
  let environment;
  let deployer, manager, investor;
  let defaultTxOpts, managerTxOpts, investorTxOpts;
  let addresses, contracts;
  let managementFeeRate;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    [deployer, manager, investor] = await environment.eth.getAccounts();
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const system = await deployAndGetSystem(environment);
    addresses = system.addresses;
    contracts = system.contracts;

    contracts.managementFee = getContract(
      environment,
      CONTRACT_NAMES.MANAGEMENT_FEE,
      await deployContract(environment, CONTRACT_NAMES.MANAGEMENT_FEE, []),
    );

    const {
      managementFee,
      mln,
      priceSource,
      registry,
      version: fundFactory,
      weth,
    } = contracts;

    const managementFeePeriod = 0;
    managementFeeRate = toWei('0.02', 'ether');

    await registry.methods
      .registerFees([managementFee.options.address.toString()])
      .send(defaultTxOpts);

    const fundName = padLeft(stringToHex('Test fund'), 64);
    await fundFactory.methods
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

    await fundFactory.methods.createAccounting().send(managerTxOpts);
    await fundFactory.methods.createFeeManager().send(managerTxOpts);
    await fundFactory.methods.createParticipation().send(managerTxOpts);
    await fundFactory.methods.createPolicyManager().send(managerTxOpts);
    await fundFactory.methods.createShares().send(managerTxOpts);
    await fundFactory.methods.createTrading().send(managerTxOpts);
    await fundFactory.methods.createVault().send(managerTxOpts);
    const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
    const hubAddress = res.events.NewFund.returnValues.hub;
    const hub = getContract(environment, CONTRACT_NAMES.HUB, hubAddress);
    const routes = await hub.methods.routes().call();
    contracts.fund = {
      accounting: getContract(
        environment,
        CONTRACT_NAMES.ACCOUNTING,
        routes.accounting,
      ),
      feeManager: getContract(
        environment,
        CONTRACT_NAMES.FEE_MANAGER,
        routes.feeManager,
      ),
      participation: getContract(
        environment,
        CONTRACT_NAMES.PARTICIPATION,
        routes.participation,
      ),
      shares: getContract(environment, CONTRACT_NAMES.SHARES, routes.shares),
    };
    addresses.fund = routes;

    const prices = await getUpdatedTestPrices();
    await priceSource.methods
      .update(
        Object.keys(prices).map(key => contracts[key].options.address),
        Object.values(prices)
      )
      .send(defaultTxOpts);
  });

  test(`fund gets ethToken from investment`, async () => {
    const { weth } = contracts;
    const { participation, shares } = contracts.fund;
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
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).add(new BN(wantedShares)),
      ),
    ).toBe(true);
  });

  test(`Reward fee rewards management fee in the form of shares`, async () => {
    const { managementFee, weth } = contracts;
    const { accounting, feeManager, shares } = contracts.fund;

    const fundCreationTime = new BN(
      await managementFee.methods
        .lastPayoutTime(feeManager.options.address)
        .call(),
    );

    const preWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const preWethManager = await weth.methods.balanceOf(manager).call();
    const preManagerShares = await shares.methods.balanceOf(manager).call();
    const preTotalSupply = await shares.methods.totalSupply().call();
    const preFundGav = await accounting.methods.calcGav().call();

    await feeManager.methods.rewardManagementFee().send(managerTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const postWethManager = await weth.methods.balanceOf(manager).call();
    const postManagerShares = await shares.methods.balanceOf(manager).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    const payoutTime = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();
    const expectedPreDilutionFeeShares = BNExpMul(
      new BN(preTotalSupply),
      new BN(managementFeeRate),
    )
      .mul(new BN(payoutTime).sub(new BN(fundCreationTime)))
      .div(new BN(yearInSeconds));

    const expectedFeeShares = new BN(preTotalSupply)
      .mul(new BN(expectedPreDilutionFeeShares))
      .div(new BN(preTotalSupply).sub(new BN(expectedPreDilutionFeeShares)));

    expect(
      new BN(postManagerShares).eq(
        new BN(preManagerShares).add(new BN(expectedFeeShares)),
      ),
    ).toBe(true);
    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).add(new BN(expectedFeeShares)),
      ),
    ).toBe(true);
    expect(new BN(postFundGav).eq(new BN(preFundGav))).toBe(true);
    // Find out a way to assert this
    // Share price is supposed to change due to time difference (keep constant)
    // expect(postFundCalculations.sharePrice).toEqual(
    //   preFundCalculations.sharePrice,
    // );
    expect(new BN(postWethFund).eq(new BN(preWethFund))).toBe(true);
    expect(new BN(postWethManager).eq(new BN(preWethManager))).toBe(true);
  });

  test(`Claims fee using triggerRewardAllFees`, async () => {
    const { managementFee, weth } = contracts;
    const { accounting, feeManager, shares } = contracts.fund;

    const lastFeeConversion = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();

    const preWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const preWethManager = await weth.methods.balanceOf(manager).call();
    const preManagerShares = await shares.methods.balanceOf(manager).call();
    const preTotalSupply = await shares.methods.totalSupply().call();
    const preFundCalcs = await accounting.methods.performCalculations().call();

    await accounting.methods.triggerRewardAllFees().send(managerTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
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
      new BN(preTotalSupply),
      new BN(managementFeeRate),
    )
      .mul(new BN(payoutTime).sub(new BN(lastFeeConversion)))
      .div(new BN(yearInSeconds));
    const expectedFeeShares = new BN(preTotalSupply)
      .mul(new BN(expectedPreDilutionFeeShares))
      .div(new BN(preTotalSupply).sub(new BN(expectedPreDilutionFeeShares)));
    const expectedFeeInDenominationAsset = new BN(expectedFeeShares)
      .mul(new BN(preFundCalcs.gav))
      .div(new BN(preTotalSupply).add(new BN(expectedFeeShares)));

    expect(
      new BN(postManagerShares).eq(
        new BN(preManagerShares).add(new BN(expectedFeeShares)),
      ),
    ).toBe(true);
    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).add(new BN(expectedFeeShares)),
      ),
    ).toBe(true);
    expect(new BN(postFundCalcs.gav).eq(new BN(preFundCalcs.gav))).toBe(true);
    // expect(postFundCalculations.sharePrice).toEqual(
    //   preFundCalculations.sharePrice,
    // );
    expect(new BN(postWethFund).eq(new BN(preWethFund))).toBe(true);
    expect(new BN(postWethManager).eq(new BN(preWethManager))).toBe(true);
    expect(
      new BN(preFundCalcs.feesInDenominationAsset).eq(
        expectedFeeInDenominationAsset,
      ),
    ).toBe(true);
    expect(
      new BN(lastConversionCalculations.allocatedFees).eq(
        expectedFeeInDenominationAsset,
      ),
    ).toBe(true);
  });

  test(`investor redeems his shares`, async () => {
    const { managementFee, weth } = contracts;
    const {
      accounting,
      feeManager,
      participation,
      shares,
      vault,
    } = contracts.fund;

    const investorShares = await shares.methods.balanceOf(investor).call();
    const lastFeeConversion = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();

    const preWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    const preTotalSupply = await shares.methods.totalSupply().call();
    const preFundGav = await accounting.methods.calcGav().call();

    // Increment next block time
    environment.eth.currentProvider.send(
      {
        id: 123,
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [1000],
      },
      (err, res) => {},
    );

    await participation.methods.redeem().send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(addresses.fund.vault)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    const payoutTime = await managementFee.methods
      .lastPayoutTime(feeManager.options.address)
      .call();
    const expectedPreDilutionFeeShares = BNExpMul(
      new BN(preTotalSupply),
      new BN(managementFeeRate),
    )
      .mul(new BN(payoutTime).sub(new BN(lastFeeConversion)))
      .div(new BN(yearInSeconds));
    const expectedFeeShares = new BN(preTotalSupply)
      .mul(new BN(expectedPreDilutionFeeShares))
      .div(new BN(preTotalSupply).sub(new BN(expectedPreDilutionFeeShares)));

    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply)
          .sub(new BN(investorShares))
          .add(expectedFeeShares),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethFund)
          .mul(new BN(investorShares))
          .div(new BN(preTotalSupply).add(expectedFeeShares))
          .add(new BN(preWethInvestor)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(
        new BN(preWethFund).sub(
          new BN(postWethInvestor).sub(new BN(preWethInvestor)),
        ),
      ),
    ).toBe(true);
    expect(new BN(postFundGav).eq(new BN(postWethFund))).toBe(true);
  });
});
