import { randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManagerActionId,
  externalPositionReactivateArgs,
  externalPositionRemoveArgs,
  ITestStandardToken,
  PolicyHook,
  validateRuleCreateExternalPositionArgs,
  validateRulePostCallOnExternalPositionArgs,
  validateRuleReactivateExternalPositionArgs,
  validateRuleRemoveExternalPositionArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  compoundDebtPositionAddCollateral,
  createExternalPosition,
  createNewFund,
  deployProtocolFixture,
  seedAccount,
} from '@enzymefinance/testutils';
import { constants } from 'ethers';

let fork: ProtocolDeployment;
let mockComptrollerProxy: any;
let mockVaultProxy: any;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  const deployer = fork.deployer;

  mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  mockVaultProxy = await VaultLib.mock(deployer);

  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const compoundDebtPositionLib = fork.deployment.compoundDebtPositionLib;
    const externalPositionManager = fork.deployment.externalPositionManager;

    expect(await externalPositionManager.getExternalPositionLibForType(0)).toMatchAddress(
      compoundDebtPositionLib.address,
    );
    expect(await externalPositionManager.getExternalPositionParserForType(0)).toMatchAddress(
      compoundDebtPositionParser.address,
    );
  });
});

describe('setConfigForFund', () => {
  it('does not allow a random caller', async () => {
    const [randomUser] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;

    await expect(
      externalPositionManager.connect(randomUser).setConfigForFund(constants.AddressZero, constants.AddressZero, '0x'),
    ).rejects.toBeRevertedWith('Only the FundDeployer can make this call');
  });

  it('happy path', async () => {
    const [fundOwner] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Assert state
    expect(await externalPositionManager.getVaultProxyForFund(comptrollerProxy)).toMatchAddress(vaultProxy);
  });
});

describe('receiveCallFromComptroller', () => {
  it('reverts if the action received is invalid', async () => {
    const [fundOwner] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;

    const { comptrollerProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const callArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(externalPositionManager, Object.keys(ExternalPositionManagerActionId).length + 1, callArgs),
    ).rejects.toBeRevertedWith('Invalid _actionId');
  });

  it('only allows the owner and asset managers', async () => {
    const [fundOwner, newAssetManager] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    // Call should be allowed by the fund owner
    await createExternalPosition({
      comptrollerProxy,
      externalPositionManager,
      externalPositionTypeId: 0,
      signer: fundOwner,
    });

    // Call not allowed by the yet-to-be added asset manager
    await expect(
      createExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: newAssetManager,
      }),
    ).rejects.toBeRevertedWith('Unauthorized');

    // Set the new asset manager
    await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

    // Call should be allowed for the added asset manager
    await createExternalPosition({
      comptrollerProxy,
      externalPositionManager,
      externalPositionTypeId: 0,
      signer: newAssetManager,
    });
  });

  describe('action: createExternalPosition', () => {
    it('reverts if it receives an invalid typeId', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;

      const { comptrollerProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      await expect(
        createExternalPosition({
          comptrollerProxy,
          externalPositionManager,
          externalPositionTypeId: 999,
          signer: fundOwner,
        }),
      ).rejects.toBeRevertedWith('Invalid typeId');
    });

    it('handles a valid call', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;

      const { comptrollerProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      await createExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: fundOwner,
      });

      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.CreateExternalPosition,
        validateRuleCreateExternalPositionArgs({
          caller: fundOwner,
          initArgs: '0x',
          typeId: 0,
        }),
      );
    });
  });

  describe('action: callOnExternalPosition', () => {
    it('handles a valid call', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;
      const cdai = new ITestStandardToken(fork.config.compound.ctokens.cdai, provider);

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      // Use CompoundDebtPosition as an example ExternalPosition to receive the Policy
      await seedAccount({ provider, account: vaultProxy, amount: 100, token: cdai });
      const collateralAssets = [cdai.address];
      const randomCToken = randomAddress();

      await createExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: fundOwner,
      });

      const activeExternalPosition = (await vaultProxy.getActiveExternalPositions.call())[0];

      // Add collateral twice to check it does not fail calling markets twice with the same assets
      await compoundDebtPositionAddCollateral({
        amounts: [1],
        assets: collateralAssets,
        cTokens: [randomCToken],
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: activeExternalPosition,
        fundOwner,
      });

      // actionArgs include assets[] amounts[] and extra data encoded
      const actionArgs = encodeArgs(
        ['address[]', 'uint256[]', 'bytes'],
        [collateralAssets, [1], encodeArgs(['address[]'], [[randomCToken]])],
      );

      const compoundActionId = 0;
      const encodedActionData = encodeArgs(['uint256', 'bytes'], [compoundActionId, actionArgs]);

      // Check policy was correctly called
      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.PostCallOnExternalPosition,
        validateRulePostCallOnExternalPositionArgs({
          amountsToTransfer: [1],
          assetsToReceive: [],
          assetsToTransfer: collateralAssets,
          caller: fundOwner,
          encodedActionData,
          externalPosition: activeExternalPosition,
        }),
      );
    });
  });

  describe('action: reactivateExternalPosition', () => {
    it('works as expected when reactivating a valid position', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      // Create an external position
      await createExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: fundOwner,
      });

      const externalPositionProxy = (await vaultProxy.getActiveExternalPositions.call())[0];

      // Removes previously created external position
      const removePositionCallArgs = externalPositionRemoveArgs({
        externalPositionProxy,
      });

      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.RemoveExternalPosition,
          removePositionCallArgs,
        );

      // Re-activate the same external position to the vault
      const reactivateExternalPositionArgs = externalPositionReactivateArgs({
        externalPositionProxy,
      });

      const activeExternalPositionsBefore = await vaultProxy.getActiveExternalPositions.call();

      expect(activeExternalPositionsBefore.length).toEqual(0);

      // Add back the previously removed position
      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.ReactivateExternalPosition,
          reactivateExternalPositionArgs,
        );

      // Check policy was correctly called
      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.ReactivateExternalPosition,
        validateRuleReactivateExternalPositionArgs({
          caller: fundOwner,
          externalPositionProxy,
        }),
      );

      const activeExternalPositionsAfter = await vaultProxy.getActiveExternalPositions.call();

      expect(activeExternalPositionsAfter[0]).toMatchAddress(externalPositionProxy);
    });

    it('reverts if the provided account is not an external position', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;

      const { comptrollerProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      const reactivateExternalPositionArgs = externalPositionReactivateArgs({
        externalPositionProxy: randomAddress(),
      });

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            externalPositionManager,
            ExternalPositionManagerActionId.ReactivateExternalPosition,
            reactivateExternalPositionArgs,
          ),
      ).rejects.toBeRevertedWith('Account provided is not a valid external position');
    });

    it('reverts if the external position is not owned by the vault proxy', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;

      const { comptrollerProxy: comptrollerProxy1, vaultProxy: vaultProxy1 } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      // Create an external position
      await createExternalPosition({
        comptrollerProxy: comptrollerProxy1,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: fundOwner,
      });

      // Create a second vault to include the external position created for the first vault
      const { comptrollerProxy: comptrollerProxy2 } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      const activeExternalPositionsBefore = await vaultProxy1.getActiveExternalPositions.call();
      const externalPositionProxy = activeExternalPositionsBefore[0];

      const reactivateExternalPositionArgs = externalPositionReactivateArgs({
        externalPositionProxy,
      });

      await expect(
        comptrollerProxy2
          .connect(fundOwner)
          .callOnExtension(
            externalPositionManager,
            ExternalPositionManagerActionId.ReactivateExternalPosition,
            reactivateExternalPositionArgs,
          ),
      ).rejects.toBeRevertedWith('External position belongs to a different vault');
    });
  });

  describe('action: removeExternalPosition', () => {
    it('works as expected when removing a external position', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      await createExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: fundOwner,
      });

      const activeExternalPositionsBefore = await vaultProxy.getActiveExternalPositions.call();
      const externalPositionProxy = activeExternalPositionsBefore[0];

      const removePositionCallArgs = externalPositionRemoveArgs({
        externalPositionProxy,
      });

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            externalPositionManager,
            ExternalPositionManagerActionId.RemoveExternalPosition,
            removePositionCallArgs,
          ),
      ).resolves.toBeReceipt();

      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.RemoveExternalPosition,
        validateRuleRemoveExternalPositionArgs({
          caller: fundOwner,
          externalPositionProxy,
        }),
      );

      const activeExternalPositionsAfter = await vaultProxy.getActiveExternalPositions.call();

      expect(activeExternalPositionsBefore.length - activeExternalPositionsAfter.length).toEqual(1);
    });

    it('handles a valid call', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fork.deployer,
      });

      await createExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionTypeId: 0,
        signer: fundOwner,
      });

      const externalPositionProxy = (await vaultProxy.getActiveExternalPositions.call())[0];

      const removeExternalPositionArgs = encodeArgs(['address'], [externalPositionProxy]);

      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.RemoveExternalPosition,
          removeExternalPositionArgs,
        );

      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.RemoveExternalPosition,
        validateRuleRemoveExternalPositionArgs({
          caller: fundOwner,
          externalPositionProxy,
        }),
      );
    });
  });
});

describe('updateExternalPositionTypesInfo', () => {
  it('updates externalPositionTypesInfo', async () => {
    const externalPositionManager = fork.deployment.externalPositionManager;
    const externalPositionFactory = fork.deployment.externalPositionFactory;

    const randomLib = randomAddress();
    const randomParser = randomAddress();

    const externalPositionCounter = await externalPositionFactory.getPositionTypeCounter();

    await externalPositionManager.updateExternalPositionTypesInfo(
      [externalPositionCounter.sub('1')],
      [randomLib],
      [randomParser],
    );

    expect(
      await externalPositionManager.getExternalPositionLibForType(externalPositionCounter.sub('1')),
    ).toMatchAddress(randomLib);
    expect(
      await externalPositionManager.getExternalPositionParserForType(externalPositionCounter.sub('1')),
    ).toMatchAddress(randomParser);
  });

  it('reverts if the caller is not the FundDeployerOwner', async () => {
    const [, randomCaller] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;
    const externalPositionFactory = fork.deployment.externalPositionFactory;

    const randomLib = randomAddress();
    const randomParser = randomAddress();

    const externalPositionCounter = await externalPositionFactory.getPositionTypeCounter();

    await expect(
      externalPositionManager
        .connect(randomCaller)
        .updateExternalPositionTypesInfo([externalPositionCounter.sub('1')], [randomLib], [randomParser]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });
});
