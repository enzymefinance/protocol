import { encodeFunctionSignature } from 'web3-eth-abi';
import { toWei } from 'web3-utils';
import { getFunctionSignature } from '../../utils/new/metadata';
import { CONTRACT_NAMES, TRACKS } from '../../utils/new/constants';
import { deployUserWhitelist } from '~/contracts/fund/policies/compliance/transactions/deployUserWhitelist';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';

describe('Happy Path', () => {
  let environment, user, defaultTxOpts;
  let userAlt;
  let defaultAmgu;
  let routes;
  let wethTokenInfo;
  let weth, participation;
  let investmentAmount, investmentAsset, participationAddress, requestedShares;
  let requestInvestmentSignatureBytes;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    expect(environment.track).toBe(TRACKS.TESTING);

    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    const requestInvestmentSignature = getFunctionSignature(
      CONTRACT_NAMES.PARTICIPATION,
      'requestInvestment',
    );

    requestInvestmentSignatureBytes = encodeFunctionSignature(
      requestInvestmentSignature
    );

    const accounts = await environment.eth.getAccounts();
    userAlt = accounts[1];
    defaultAmgu = toWei('0.01', 'ether');

    routes = await setupInvestedTestFund(environment);

    wethTokenInfo = getTokenBySymbol(environment, 'WETH');

    weth = getContract(
      environment,
      CONTRACT_NAMES.WETH,
      wethTokenInfo.address,
    );
    participation = getContract(
      environment,
      CONTRACT_NAMES.PARTICIPATION,
      routes.participationAddress.toString(),
    );

    investmentAmount = toWei('1', 'ether');
    requestedShares = toWei('1', 'ether');
    investmentAsset = wethTokenInfo.address;
    participationAddress = routes.participationAddress.toString();

    const policyManager = getContract(
      environment,
      CONTRACT_NAMES.POLICY_MANAGER,
      routes.policyManagerAddress.toString()
    );
    const userWhitelist = await deployContract(
      environment,
      CONTRACT_NAMES.USER_WHITELIST,
      [[user]]
    );
    await policyManager.methods
      .register(
        requestInvestmentSignatureBytes,
        userWhitelist.toString()
      )
      .send(defaultTxOpts);
  });

  test('Request investment fails if user is not whitelisted', async () => {
    await weth.methods
      .transfer(userAlt, investmentAmount)
      .send(defaultTxOpts);

    await weth.methods
      .approve(participationAddress, investmentAmount)
      .send({ ...defaultTxOpts, from: userAlt });

    await expect(
      participation.methods
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
      .approve(participationAddress, investmentAmount)
      .send(defaultTxOpts);

    await expect(
      participation.methods
        .requestInvestment(
          requestedShares,
          investmentAmount,
          investmentAsset
        )
        .send({ ...defaultTxOpts, value: defaultAmgu })
    ).resolves.not.toThrow();
  });
});
