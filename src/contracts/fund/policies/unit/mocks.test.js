import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { Contracts } from '~/Contracts';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployAndGetContract } from '~/utils/solidity/deployAndGetContract';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import * as Web3Utils from 'web3-utils';

describe('mocks', () => {
  let environment, user, defaultTxOpts;
  let falsePolicy, truePolicy, testPolicy;
  let dummyArgs;

  const createManagerAndRegister = async (contract, policy) => {
    const contracts = await deployMockSystem(environment, {
      policyManagerContract: Contracts.PolicyManager,
    });
    await contracts.policyManager.methods
      .register(testPolicy, policy)
      .send(defaultTxOpts);
    return contracts.policyManager;
  };

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    falsePolicy = await deployAndGetContract(
      environment,
      Contracts.FalsePolicy,
    );
    truePolicy = await deployAndGetContract(
      environment,
      Contracts.TruePolicy,
    );
    testPolicy = Web3Utils.sha3(
      'testPolicy(address[4],uint256[2])',
    ).substring(0, 10);
    dummyArgs = [
      testPolicy,
      [emptyAddress, emptyAddress, emptyAddress, emptyAddress, emptyAddress],
      [0, 0, 0],
      '0x0',
    ];
  });

  it('Boolean policies', async () => {
    const res1 = await falsePolicy.methods
      .rule(...dummyArgs)
      .call();
    const res2 = await truePolicy.methods
      .rule(...dummyArgs)
      .call();
    expect(res1).toBe(false);
    expect(res2).toBe(true);
  });

  it('Boolean policies on policy manager', async () => {
    const manager1 = await createManagerAndRegister(
      Contracts.PolicyManager,
      falsePolicy.options.address,
    );
    await expect(
      manager1.methods.preValidate(...dummyArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');

    const manager2 = await createManagerAndRegister(
      Contracts.PolicyManager,
      truePolicy.options.address,
    );
    await expect(
      manager2.methods.preValidate(...dummyArgs).call(),
    ).resolves.not.toThrow();
  });
});
