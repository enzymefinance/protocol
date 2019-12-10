import { sha3 } from 'web3-utils';

import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('mocks', () => {
  let user, defaultTxOpts;
  let falsePolicy, truePolicy, testPolicy;
  let dummyArgs;

  const createManagerAndRegister = async (contract, policy) => {
    const contracts = await deployMockSystem({
      policyManagerContract: CONTRACT_NAMES.POLICY_MANAGER
    });
    await contracts.policyManager.methods
      .register(testPolicy, policy)
      .send(defaultTxOpts);
    return contracts.policyManager;
  };

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    falsePolicy = await deploy(CONTRACT_NAMES.FALSE_POLICY);
    truePolicy = await deploy(CONTRACT_NAMES.TRUE_POLICY);
    testPolicy = sha3(
      'testPolicy(address[4],uint256[2])'
    ).substring(0, 10);
    dummyArgs = [
      testPolicy,
      [EMPTY_ADDRESS, EMPTY_ADDRESS, EMPTY_ADDRESS, EMPTY_ADDRESS, EMPTY_ADDRESS],
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
      CONTRACT_NAMES.POLICY_MANAGER,
      falsePolicy.options.address,
    );
    await expect(
      manager1.methods.preValidate(...dummyArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');

    const manager2 = await createManagerAndRegister(
      CONTRACT_NAMES.POLICY_MANAGER,
      truePolicy.options.address,
    );
    await expect(
      manager2.methods.preValidate(...dummyArgs).call(),
    ).resolves.not.toThrow();
  });
});
