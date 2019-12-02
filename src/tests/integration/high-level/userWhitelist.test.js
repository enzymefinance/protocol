import { encodeFunctionSignature } from 'web3-eth-abi';
import { toWei } from 'web3-utils';

import { deploy } from '~/../deploy/utils/deploy-contract';
import { partialRedeploy } from '~/../deploy/scripts/deploy-system';
import web3 from '~/../deploy/utils/get-web3';

import { CONTRACT_NAMES, TRACKS } from '../../utils/new/constants';
import { getFunctionSignature } from '../../utils/new/metadata';
import setupInvestedTestFund from '~/tests/utils/new/setupInvestedTestFund';

describe('Happy Path', () => {
  let environment, user, defaultTxOpts;
  let userAlt;
  let defaultAmgu;
  let fund;
  let weth;
  let investmentAmount, investmentAsset, requestedShares;
  let requestInvestmentSignatureBytes;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;

    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    userAlt = accounts[1];
    defaultTxOpts = {from: user, gas: 8000000};
    defaultAmgu = toWei('1', 'ether');

    const requestInvestmentSignature = getFunctionSignature(
      CONTRACT_NAMES.PARTICIPATION,
      'requestInvestment',
    );

    requestInvestmentSignatureBytes = encodeFunctionSignature(
      requestInvestmentSignature
    );

    fund = await setupInvestedTestFund(contracts, user);

    weth = contracts.WETH;

    investmentAmount = toWei('1', 'ether');
    requestedShares = toWei('1', 'ether');
    investmentAsset = weth.options.address;

    const userWhitelist = await deploy(CONTRACT_NAMES.USER_WHITELIST, [[user]]);

    await fund.policyManager.methods
      .register(
        requestInvestmentSignatureBytes,
        userWhitelist.options.address
      ).send(defaultTxOpts);
  });

  test('Request investment fails if user is not whitelisted', async () => {
    await weth.methods
      .transfer(userAlt, investmentAmount)
      .send(defaultTxOpts);

    await weth.methods
      .approve(fund.participation.options.address, investmentAmount)
      .send({ ...defaultTxOpts, from: userAlt });

    await expect(
      fund.participation.methods
        .requestInvestment(
          requestedShares,
          investmentAmount,
          investmentAsset
         )
        .send({ ...defaultTxOpts, from: userAlt, value: defaultAmgu })
    ).rejects.toThrow();
  });

  test('Request investment passes if user is whitelisted', async () => {
    await weth.methods
      .approve(fund.participation.options.address, investmentAmount)
      .send(defaultTxOpts);

    await expect(
      fund.participation.methods
        .requestInvestment(
          requestedShares,
          investmentAmount,
          investmentAsset
        )
        .send({ ...defaultTxOpts, value: defaultAmgu })
    ).resolves.not.toThrow();
  });
});
