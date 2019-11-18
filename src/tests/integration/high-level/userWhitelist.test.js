import { toWei } from 'web3-utils';

import { Contracts } from '~/Contracts';
import { deployUserWhitelist } from '~/contracts/fund/policies/compliance/transactions/deployUserWhitelist';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { Environment, Tracks } from '~/utils/environment/Environment';
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

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    expect(environment.track).toBe(Tracks.TESTING);

    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    const accounts = await environment.eth.getAccounts();
    userAlt = accounts[1];
    defaultAmgu = toWei('0.01', 'ether');

    routes = await setupInvestedTestFund(environment);

    wethTokenInfo = getTokenBySymbol(environment, 'WETH');

    weth = getContract(
      environment,
      Contracts.Weth,
      wethTokenInfo.address,
    );
    participation = getContract(
      environment,
      Contracts.Participation,
      routes.participationAddress.toString(),
    );

    investmentAmount = toWei('1', 'ether');
    requestedShares = toWei('1', 'ether');
    investmentAsset = wethTokenInfo.address;
    participationAddress = routes.participationAddress.toString();

    const policyManager = getContract(
      environment,
      Contracts.PolicyManager,
      routes.policyManagerAddress.toString()
    );
    const userWhitelist = await deployContract(
      environment,
      Contracts.UserWhitelist,
      [[user]]
    );
    const functionSig = environment.eth.abi.encodeFunctionSignature(
      FunctionSignatures.requestInvestment
    );
    await policyManager.methods
      .register(
        functionSig,
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
