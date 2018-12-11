import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { Contracts } from '~/Contracts';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployAndGetContract } from '~/utils/solidity/deployAndGetContract';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import * as Web3Utils from 'web3-utils';

describe('mocks', () => {
  const shared: any = {};

  const createManagerAndRegister = async (contract, policy) => {
    const contracts = await deployMockSystem(shared.env, {
      policyManagerContract: Contracts.PolicyManager,
    });
    await contracts.policyManager.methods
      .register(shared.testPolicy, policy)
      .send({ from: shared.user, gas: 8000000 });
    return contracts.policyManager;
  };

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.user = shared.env.wallet.address;

    shared.falsePolicy = await deployAndGetContract(
      shared.env,
      Contracts.FalsePolicy,
    );
    shared.truePolicy = await deployAndGetContract(
      shared.env,
      Contracts.TruePolicy,
    );
    shared.testPolicy = Web3Utils.sha3(
      'testPolicy(address[4],uint256[2])',
    ).substring(0, 10);
    shared.dummyArgs = [
      shared.testPolicy,
      [emptyAddress, emptyAddress, emptyAddress, emptyAddress, emptyAddress],
      [0, 0, 0],
      '0x0',
    ];
  });

  it('Boolean policies', async () => {
    const res1 = await shared.falsePolicy.methods
      .rule(...shared.dummyArgs)
      .call();
    const res2 = await shared.truePolicy.methods
      .rule(...shared.dummyArgs)
      .call();
    expect(res1).toBe(false);
    expect(res2).toBe(true);
  });

  it('Boolean policies on policy manager', async () => {
    const manager1 = await createManagerAndRegister(
      Contracts.PolicyManager,
      shared.falsePolicy.options.address,
    );
    await expect(
      manager1.methods.preValidate(...shared.dummyArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');

    const manager2 = await createManagerAndRegister(
      Contracts.PolicyManager,
      shared.truePolicy.options.address,
    );
    await expect(
      manager2.methods.preValidate(...shared.dummyArgs).call(),
    ).resolves.not.toThrow();
  });
});
