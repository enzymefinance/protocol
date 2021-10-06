import { randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  externalPositionRemoveArgs,
  ExternalPositionManagerActionId,
  VaultLib,
  PolicyHook,
  validateRuleCreateExternalPositionArgs,
  validateRuleRemoveExternalPositionArgs,
  StandardToken,
  validateRulePostCallOnExternalPositionArgs,
  encodeArgs,
  externalPositionReactivateArgs,
  validateRuleReactivateExternalPositionArgs,
} from '@enzymefinance/protocol';
import {
  compoundDebtPositionAddCollateral,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
} from '@enzymefinance/testutils';

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

describe('receiveCallFromComptroller', () => {
  it('reverts if the action received is invalid', async () => {
    const [fundOwner] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;

    const { comptrollerProxy } = await createNewFund({
      signer: fork.deployer,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
      signer: fork.deployer,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    const callArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

    // Call should be allowed by the fund owner
    await comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs);

    // Call not allowed by the yet-to-be added asset manager
    await expect(
      comptrollerProxy
        .connect(newAssetManager)
        .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs),
    ).rejects.toBeRevertedWith('Unauthorized');

    // Set the new asset manager
    await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

    // Call should be allowed for the added asset manager
    await comptrollerProxy
      .connect(newAssetManager)
      .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs);
  });

  describe('action: createExternalPosition', () => {
    it('reverts if it receives an invalid typeId', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;

      const { comptrollerProxy } = await createNewFund({
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      const callArgs = encodeArgs(['uint256', 'bytes'], [1, '0x']);

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs),
      ).rejects.toBeRevertedWith('Invalid typeId');
    });

    it('handles a valid call', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;

      const { comptrollerProxy } = await createNewFund({
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      const callArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs);

      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.CreateExternalPosition,
        validateRuleCreateExternalPositionArgs({
          caller: fundOwner,
          typeId: 0,
          initArgs: '0x',
        }),
      );
    });
  });

  describe('action: callOnExternalPosition', () => {
    it('handles a valid call', async () => {
      const [fundOwner] = fork.accounts;
      const externalPositionManager = fork.deployment.externalPositionManager;
      const policyManager = fork.deployment.policyManager;
      const cdai = new StandardToken(fork.config.compound.ctokens.cdai, whales.cdai);

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      // Use CompoundDebtPosition as an example ExternalPosition to receive the Policy
      await cdai.transfer(vaultProxy, 100);
      const collateralAssets = [cdai.address];
      const randomCToken = randomAddress();
      const createExternalPositionArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.CreateExternalPosition,
          createExternalPositionArgs,
        );

      const activeExternalPosition = (await vaultProxy.getActiveExternalPositions.call())[0];

      // Add collateral twice to check it does not fail calling markets twice with the same assets
      await compoundDebtPositionAddCollateral({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: activeExternalPosition,
        assets: collateralAssets,
        amounts: [1],
        cTokens: [randomCToken],
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
          caller: fundOwner,
          externalPosition: activeExternalPosition,
          assetsToTransfer: collateralAssets,
          amountsToTransfer: [1],
          assetsToReceive: [],
          encodedActionData,
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
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      // Create an external position
      const createPositionCallArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.CreateExternalPosition,
          createPositionCallArgs,
        );

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
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      const createPositionCallArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      // Create an external position
      await comptrollerProxy1
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.CreateExternalPosition,
          createPositionCallArgs,
        );

      // Create a second vault to include the external position created for the first vault
      const { comptrollerProxy: comptrollerProxy2 } = await createNewFund({
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      const createPositionCallArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            externalPositionManager,
            ExternalPositionManagerActionId.CreateExternalPosition,
            createPositionCallArgs,
          ),
      ).resolves.toBeReceipt();

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
        signer: fork.deployer,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      });

      const createExternalPositionArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          externalPositionManager,
          ExternalPositionManagerActionId.CreateExternalPosition,
          createExternalPositionArgs,
        );

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