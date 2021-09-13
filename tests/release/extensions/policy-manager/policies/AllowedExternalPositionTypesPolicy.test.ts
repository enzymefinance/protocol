import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  AllowedExternalPositionTypesPolicy,
  allowedExternalPositionTypesPolicyArgs,
  ComptrollerLib,
  ExternalPositionManager,
  ExternalPositionType,
  IExternalPositionProxy,
  PolicyHook,
  PolicyManager,
  policyManagerConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  createCompoundDebtPosition,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
  reactivateExternalPosition,
  removeExternalPosition,
} from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let allowedExternalPositionTypesPolicy: AllowedExternalPositionTypesPolicy;
beforeEach(async () => {
  fork = await deployProtocolFixture();

  allowedExternalPositionTypesPolicy = fork.deployment.allowedExternalPositionTypesPolicy;
});

describe('constructor', () => {
  it('sets state vars', async () => {
    // PolicyBase
    expect(await allowedExternalPositionTypesPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);
  });
});

describe('activateForFund', () => {
  it('cannot be called by a random user', async () => {
    await expect(allowedExternalPositionTypesPolicy.activateForFund(randomAddress())).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it.todo('does not allow an active external position with a disallowed type');
});

describe('addFundSettings', () => {
  let fundOwner: SignerWithAddress;
  beforeEach(async () => {
    [fundOwner] = fork.accounts;
  });

  it('cannot be called by a random user', async () => {
    await expect(allowedExternalPositionTypesPolicy.addFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('happy path: multiple external position types', async () => {
    const externalPositionTypeIds = [0, 2, 5];

    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPolicy],
        settings: [
          allowedExternalPositionTypesPolicyArgs({
            externalPositionTypeIds,
          }),
        ],
      }),
    });

    // Assert state and events
    const events = extractEvent(
      receipt,
      allowedExternalPositionTypesPolicy.abi.getEvent('AllowedExternalPositionTypeAddedForFund'),
    );
    expect(events.length).toBe(externalPositionTypeIds.length);
    for (const i in externalPositionTypeIds) {
      expect(
        await allowedExternalPositionTypesPolicy.externalPositionTypeIsAllowedForFund(
          comptrollerProxy,
          externalPositionTypeIds[i],
        ),
      ).toBe(true);
      expect(events[i]).toMatchEventArgs({
        comptrollerProxy,
        externalPositionTypeId: externalPositionTypeIds[i],
      });
    }
  });

  it('happy path: no external position types', async () => {
    // Just confirm that the policy can be added without any config
    await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPolicy],
        settings: [
          allowedExternalPositionTypesPolicyArgs({
            externalPositionTypeIds: [],
          }),
        ],
      }),
    });
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    expect(await fork.deployment.allowedExternalPositionTypesPolicy.canDisable()).toBe(false);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const allowedExternalPositionTypesPolicy = fork.deployment.allowedExternalPositionTypesPolicy;

    expect(await allowedExternalPositionTypesPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedExternalPositionTypesPolicy.implementedHooks.fragment,
      [PolicyHook.CreateExternalPosition, PolicyHook.ReactivateExternalPosition],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.allowedExternalPositionTypesPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('validateRule', () => {
  let fundOwner: SignerWithAddress;
  let allowedExternalPositionTypesPolicy: AllowedExternalPositionTypesPolicy,
    externalPositionManager: ExternalPositionManager;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    allowedExternalPositionTypesPolicy = fork.deployment.allowedExternalPositionTypesPolicy;
    externalPositionManager = fork.deployment.externalPositionManager;
  });

  describe('PolicyHook.CreateExternalPosition', () => {
    it('does not allow creating an external position of unallowed type', async () => {
      // Add policy without any allowed external position types
      const { comptrollerProxy } = await createNewFund({
        signer: fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [allowedExternalPositionTypesPolicy],
          settings: [
            allowedExternalPositionTypesPolicyArgs({
              externalPositionTypeIds: [],
            }),
          ],
        }),
      });

      await expect(
        createCompoundDebtPosition({
          signer: fundOwner,
          comptrollerProxy,
          externalPositionManager,
        }),
      ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_EXTERNAL_POSITION_TYPES');
    });

    it('allows creating an external position of an allowed type', async () => {
      const { comptrollerProxy } = await createNewFund({
        signer: fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [allowedExternalPositionTypesPolicy],
          settings: [
            allowedExternalPositionTypesPolicyArgs({
              externalPositionTypeIds: [ExternalPositionType.CompoundDebtPosition, 999],
            }),
          ],
        }),
      });

      await createCompoundDebtPosition({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager,
      });
    });
  });

  describe('PolicyHook.ReactivateExternalPosition', () => {
    let policyManager: PolicyManager;
    let comptrollerProxy: ComptrollerLib;
    let externalPositionProxy: IExternalPositionProxy;

    beforeEach(async () => {
      policyManager = fork.deployment.policyManager;

      const newFundRes = await createNewFund({
        signer: fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundOwner,
      });
      comptrollerProxy = newFundRes.comptrollerProxy;

      const createCompoundDebtPositionRes = await createCompoundDebtPosition({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager,
      });
      externalPositionProxy = createCompoundDebtPositionRes.externalPositionProxy;

      await removeExternalPosition({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager,
        externalPositionProxy,
      });
    });

    it('does not allow creating an external position of unallowed type', async () => {
      // Add policy that allows only an out-of-range position type id
      await policyManager
        .connect(fundOwner)
        .enablePolicyForFund(
          comptrollerProxy,
          allowedExternalPositionTypesPolicy,
          allowedExternalPositionTypesPolicyArgs({ externalPositionTypeIds: [9999] }),
        );

      await expect(
        reactivateExternalPosition({
          signer: fundOwner,
          comptrollerProxy,
          externalPositionManager,
          externalPositionProxy,
        }),
      ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_EXTERNAL_POSITION_TYPES');
    });

    it('allows creating an external position of an allowed type', async () => {
      // Add policy that allows the externalPositionProxy
      const externalPositionTypeId = await externalPositionProxy.getExternalPositionType();
      await policyManager
        .connect(fundOwner)
        .enablePolicyForFund(
          comptrollerProxy,
          allowedExternalPositionTypesPolicy,
          allowedExternalPositionTypesPolicyArgs({ externalPositionTypeIds: [externalPositionTypeId] }),
        );

      await reactivateExternalPosition({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager,
        externalPositionProxy,
      });
    });
  });
});
