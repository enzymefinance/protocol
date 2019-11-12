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
  let s = {};

  beforeAll(async () => {
    s.env = await deployAndInitTestEnv();
    expect(s.env.track).toBe(Tracks.TESTING);

    // Define user accounts
    s.user = s.env.wallet.address;
    s.standardGas = 8000000;
    s.defaultTxOpts = { from: s.user, gas: s.standardGas };
    s.defaultAmgu = toWei('0.01', 'ether');

    s.accounts = await s.env.eth.getAccounts();
    s.userAlt = s.accounts[1];

    // Setup necessary contracts
    s.routes = await setupInvestedTestFund(s.env);
    const policyManager = getContract(
      s.env,
      Contracts.PolicyManager,
      s.routes.policyManagerAddress.toString()
    );
    const userWhitelist = await deployContract(
      s.env,
      Contracts.UserWhitelist,
      [[s.user],]
    );
    const functionSig = s.env.eth.abi.encodeFunctionSignature(
      FunctionSignatures.requestInvestment
    );
    await policyManager.methods
      .register(
        functionSig,
        userWhitelist.toString()
      )
      .send(s.defaultTxOpts);

    // Define shared contracts
    s.weth = getTokenBySymbol(s.env, 'WETH');
    s.wethInterface = getContract(
      s.env,
      Contracts.Weth,
      s.weth.address,
    );
    s.participation = getContract(
      s.env,
      Contracts.Participation,
      s.routes.participationAddress.toString(),
    );

    // Define shared params
    s.investmentAmount = toWei('1', 'ether');
    s.requestedShares = toWei('1', 'ether');
    s.investmentAsset = s.weth.address;
    s.participationAddress = s.routes.participationAddress.toString();
  });

  test('Request investment fails if user is not whitelisted', async () => {
    await s.wethInterface.methods
      .transfer(s.userAlt, s.investmentAmount)
      .send(s.defaultTxOpts);

    await s.wethInterface.methods
      .approve(s.participationAddress, s.investmentAmount)
      .send({ ...s.defaultTxOpts, from: s.userAlt });

    await expect(
      s.participation.methods
        .requestInvestment(
          s.requestedShares,
          s.investmentAmount,
          s.investmentAsset
         )
        .send({ ...s.defaultTxOpts, from: s.userAlt, value: s.defaultAmgu })
    ).rejects.toThrow();
  });

  test('Request investment passes if user is whitelisted', async () => {
    await s.wethInterface.methods
      .approve(s.participationAddress, s.investmentAmount)
      .send(s.defaultTxOpts);

    await expect(
      s.participation.methods
        .requestInvestment(
          s.requestedShares,
          s.investmentAmount,
          s.investmentAsset
        )
        .send({ ...s.defaultTxOpts, value: s.defaultAmgu })
    ).resolves.not.toThrow();
  });
});
