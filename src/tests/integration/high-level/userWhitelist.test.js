import { encodeFunctionSignature } from 'web3-eth-abi';
import { toWei } from 'web3-utils';
import { getFunctionSignature } from '../../utils/new/metadata';
import { CONTRACT_NAMES } from '../../utils/new/constants';
const setupInvestedTestFund = require('../../utils/new/setupInvestedTestFund');
const web3 = require('../../../../new/deploy/get-web3');
const deploySystem = require('../../../../new/deploy/deploy-system');
const {deploy} = require('../../../../new/deploy/deploy-contract');

describe('Happy Path', () => {
  let environment, user, defaultTxOpts;
  let userAlt;
  let defaultAmgu;
  let fund;
  let weth;
  let investmentAmount, investmentAsset, requestedShares;
  let requestInvestmentSignatureBytes;

  beforeAll(async () => {
    const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    const contracts = deployment.contracts;

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
