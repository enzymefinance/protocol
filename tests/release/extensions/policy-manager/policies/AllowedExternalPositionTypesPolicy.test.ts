import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  AllowedExternalPositionTypesPolicy,
  ComptrollerLib,
  ExternalPositionManager,
  IExternalPositionProxy,
  PolicyManager,
} from '@enzymefinance/protocol';
import {
  allowedExternalPositionTypesPolicyArgs,
  ExternalPositionType,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createCompoundDebtPosition,
  createNewFund,
  deployProtocolFixture,
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
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPolicy],
        settings: [
          allowedExternalPositionTypesPolicyArgs({
            externalPositionTypeIds,
          }),
        ],
      }),
      signer: fundOwner,
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
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedExternalPositionTypesPolicy],
        settings: [
          allowedExternalPositionTypesPolicyArgs({
            externalPositionTypeIds: [],
          }),
        ],
      }),
      signer: fundOwner,
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
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [allowedExternalPositionTypesPolicy],
          settings: [
            allowedExternalPositionTypesPolicyArgs({
              externalPositionTypeIds: [],
            }),
          ],
        }),
        signer: fundOwner,
      });

      await expect(
        createCompoundDebtPosition({
          comptrollerProxy,
          externalPositionManager,
          signer: fundOwner,
        }),
      ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_EXTERNAL_POSITION_TYPES');
    });

    it('allows creating an external position of an allowed type', async () => {
      const { comptrollerProxy } = await createNewFund({
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [allowedExternalPositionTypesPolicy],
          settings: [
            allowedExternalPositionTypesPolicyArgs({
              externalPositionTypeIds: [ExternalPositionType.CompoundDebtPosition, 999],
            }),
          ],
        }),
        signer: fundOwner,
      });

      await createCompoundDebtPosition({
        comptrollerProxy,
        externalPositionManager,
        signer: fundOwner,
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
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fundOwner,
      });
      comptrollerProxy = newFundRes.comptrollerProxy;

      const createCompoundDebtPositionRes = await createCompoundDebtPosition({
        comptrollerProxy,
        externalPositionManager,
        signer: fundOwner,
      });
      externalPositionProxy = createCompoundDebtPositionRes.externalPositionProxy;

      await removeExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionProxy,
        signer: fundOwner,
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
          comptrollerProxy,
          externalPositionManager,
          externalPositionProxy,
          signer: fundOwner,
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
        comptrollerProxy,
        externalPositionManager,
        externalPositionProxy,
        signer: fundOwner,
      });
    });
  });
});
