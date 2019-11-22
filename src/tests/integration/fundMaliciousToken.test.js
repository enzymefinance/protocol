import { BN, toWei } from 'web3-utils';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { getFundComponents } from '~/utils/getFundComponents';
import { stringToBytes } from '../utils/new/formatting';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { CONTRACT_NAMES } from '../utils/new/constants';

describe('fund-malicious-token', () => {
  let environment, accounts;
  let defaultTxOpts, investorTxOpts, managerTxOpts;
  let deployer, manager, investor;
  let addresses, contracts;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    accounts = await environment.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };
    investorTxOpts = { ...defaultTxOpts, from: investor };

    const system = await deployAndGetSystem(environment);
    addresses = system.addresses;
    contracts = system.contracts;

    const { mln, registry, version: fundFactory, weth } = contracts;

    const maliciousTokenAddress = await deployContract(
      environment,
      CONTRACT_NAMES.MALICIOUS_TOKEN,
      ['MLC', 18, 'Malicious'],
    );

    await registry.methods
      .registerAsset(
        maliciousTokenAddress.toLowerCase(),
        'Malicious',
        'MLC',
        '',
        0,
        [],
        [],
      )
      .send(defaultTxOpts);

    contracts.maliciousToken = await getContract(
      environment,
      CONTRACT_NAMES.MALICIOUS_TOKEN,
      maliciousTokenAddress,
    );

    await fundFactory.methods
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
          maliciousTokenAddress.toString(),
        ],
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

    const envManager = withDifferentAccount(environment, manager);
    contracts.fund = await getFundComponents(envManager, hubAddress);

    await updateTestingPriceFeed(contracts, environment);
  });

  test('investor gets initial ethToken for testing)', async () => {
    const { fund, weth } = contracts;
    const initialTokenAmount = toWei('10', 'ether');

    const preWethInvestor = await weth.methods.balanceOf(investor).call();
    await weth.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);
    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).add(new BN(initialTokenAmount)),
      ),
    ).toBe(true);
  });

  test('fund receives ETH from investment', async () => {
    const { fund, weth } = contracts;
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

    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).sub(new BN(offeredValue)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(new BN(preWethFund).add(new BN(offeredValue))),
    ).toBe(true);
  });

  test(`General redeem fails in presence of malicious token`, async () => {
    const { maliciousToken } = contracts;
    const { vault, participation } = contracts.fund;

    await maliciousToken.methods
      .transfer(vault.options.address, 1000000)
      .send(defaultTxOpts);
    await maliciousToken.methods.startReverting().send(defaultTxOpts);

    expect(
      participation.methods.redeem().send(investorTxOpts),
    ).rejects.toThrow();
  });

  test(`Redeem with constraints works as expected`, async () => {
    const { mln, weth } = contracts;
    const { accounting, participation, shares, vault } = contracts.fund;

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
    const postWethInvestor = await weth.methods.balanceOf(investor).call();
    const postTotalSupply = await shares.methods.totalSupply().call();
    const postFundGav = await accounting.methods.calcGav().call();

    expect(
      new BN(postTotalSupply).eq(
        new BN(preTotalSupply).sub(new BN(investorShares)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).add(new BN(preWethFund)),
      ),
    ).toBe(true);
    expect(new BN(postWethFund).eq(new BN(0))).toBe(true);
    expect(postMlnFund).toEqual(preMlnFund);
    expect(postMlnInvestor).toEqual(preMlnInvestor);
    expect(new BN(postFundGav).eq(new BN(0))).toBe(true);
  });
});
