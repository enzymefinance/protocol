import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';

import { CONTRACT_NAMES } from '~/tests/utils/new/constants';
import { getFunctionSignature } from '~/tests/utils/new/metadata';

let environment;
let deployer, manager, investor, badInvestor;
let defaultTxOpts, managerTxOpts, investorTxOpts, badInvestorTxOpts;
let addresses, contracts;
let requestInvestmentFunctionSig;

beforeAll(async () => {
  environment = await deployAndInitTestEnv();
  [deployer, manager, investor, badInvestor] = await environment.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  badInvestorTxOpts = { ...defaultTxOpts, from: badInvestor };

  addresses = environment.deployment;

  const mln = getContract(
    environment,
    CONTRACT_NAMES.BURNABLE_TOKEN,
    addresses.thirdPartyContracts.tokens.find(
      token => token.symbol === 'MLN'
    ).address
  );
  const priceSource = getContract(
    environment,
    CONTRACT_NAMES.TESTING_PRICEFEED,
    addresses.melonContracts.priceSource
  );
  const weth = getContract(
    environment,
    CONTRACT_NAMES.WETH,
    addresses.thirdPartyContracts.tokens.find(
      token => token.symbol === 'WETH'
    ).address
  );
  contracts = { mln, priceSource, weth };

  requestInvestmentFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.PARTICIPATION,
    'requestInvestment',
  );

  await weth.methods.transfer(investor, toWei('10', 'ether')).send(defaultTxOpts);
});

describe('Fund 1: user whitelist', () => {
  let fundAddresses, fundContracts, policyContracts;
  let amguAmount, offeredValue, wantedShares;

  beforeAll(async () => {
    const { weth } = contracts;

    fundAddresses = await setupInvestedTestFund(environment);

    const participation = getContract(
      environment,
      CONTRACT_NAMES.PARTICIPATION,
      fundAddresses.participationAddress
    );
    const policyManager = getContract(
      environment,
      CONTRACT_NAMES.POLICY_MANAGER,
      fundAddresses.policyManagerAddress
    );
    const shares = getContract(
      environment,
      CONTRACT_NAMES.SHARES,
      fundAddresses.sharesAddress
    );
    fundContracts = { participation, policyManager, shares };

    const userWhitelist = getContract(
      environment,
      CONTRACT_NAMES.USER_WHITELIST,
      await deployContract(
        environment,
        CONTRACT_NAMES.USER_WHITELIST,
        [[investor]]
      )
    );
    policyContracts = { userWhitelist };

    await policyManager.methods
      .register(
        encodeFunctionSignature(requestInvestmentFunctionSig),
        userWhitelist.options.address,
      )
      .send(defaultTxOpts);

    amguAmount = toWei('.01', 'ether');
    offeredValue = toWei('1', 'ether');
    wantedShares = toWei('1', 'ether');
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fundContracts;
    const { userWhitelist } = policyContracts;

    const requestInvestmentPoliciesRes = await policyManager.methods
      .getPoliciesBySig(encodeFunctionSignature(requestInvestmentFunctionSig))
      .call();
    const requestInvestmentPolicyAddresses = [
      ...requestInvestmentPoliciesRes[0],
      ...requestInvestmentPoliciesRes[1]
    ];

    expect(
      requestInvestmentPolicyAddresses.includes(userWhitelist.options.address)
    ).toBe(true);
  });

  test('Bad request investment: user not on whitelist', async () => {
    const { weth } = contracts;
    const { participation } = fundContracts;

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(badInvestorTxOpts);

    await expect(
      participation.methods
        .requestInvestment(offeredValue, wantedShares, weth.options.address)
        .send({ ...badInvestorTxOpts, value: amguAmount }),
    ).rejects.toThrow();
  });

  test('Good request investment: user is whitelisted', async () => {
    const { mln, priceSource, weth } = contracts;
    const { participation, shares } = fundContracts;

    await weth.methods
      .approve(participation.options.address, offeredValue)
      .send(investorTxOpts);
    await participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });

    // Need price update before participation executed
    environment.eth.currentProvider.send(
      {
        id: 121,
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [1800], // 30 mins
      },
      (err, res) => {},
    );
    await priceSource.methods
      .update(
        [weth.options.address, mln.options.address],
        [toWei('1', 'ether'), toWei('0.5', 'ether')],
      )
      .send(defaultTxOpts);

    await participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const investorShares = await shares.methods.balanceOf(investor).call();

    expect(investorShares).toEqual(wantedShares);
  });
});
