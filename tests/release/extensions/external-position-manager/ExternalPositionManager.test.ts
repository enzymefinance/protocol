import { randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  externalPositionRemoveArgs,
  ExternalPositionManagerActionId,
  VaultLib,
  WETH,
  encodeArgs,
} from '@enzymefinance/protocol';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const denominationAsset = new WETH(config.weth, whales.weth);
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  // Deploy connected mocks for ComptrollerProxy and VaultProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  const mockVaultProxy = await VaultLib.mock(deployer);

  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      vaultProxy,
    },
    mockComptrollerProxy,
    mockVaultProxy,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { compoundDebtPositionParser, compoundDebtPositionLib, externalPositionManager },
    } = await provider.snapshot(snapshot);
    const typeInfo = await externalPositionManager.getTypeInfo(0);

    expect(typeInfo.parser).toMatchAddress(compoundDebtPositionParser.address);
    expect(typeInfo.lib).toMatchAddress(compoundDebtPositionLib.address);
  });
});

describe('activateForFund', () => {
  it('does not allow an already active fund', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    // Should pass the first time
    await expect(mockComptrollerProxy.forward(integrationManager.activateForFund, false)).resolves.toBeReceipt();

    // Should fail a second time
    await expect(mockComptrollerProxy.forward(integrationManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Already set',
    );
  });

  it('does not allow a missing vaultProxy', async () => {
    const {
      deployment: { externalPositionManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    await mockComptrollerProxy.getVaultProxy.returns(constants.AddressZero);

    await expect(mockComptrollerProxy.forward(externalPositionManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Missing vaultProxy',
    );
  });

  it('does not allow a vaultProxy for which the sender is not the accessor', async () => {
    const {
      deployment: { externalPositionManager },
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    await mockVaultProxy.getAccessor.returns(randomAddress());

    await expect(mockComptrollerProxy.forward(externalPositionManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Not the VaultProxy accessor',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Stores the ComptrollerProxy-VaultProxy pairing
    const getVaultProxyForFundCall = await integrationManager.getVaultProxyForFund(comptrollerProxy);

    expect(getVaultProxyForFundCall).toMatchAddress(vaultProxy);

    // Vault owner should be an authorized user
    const isAuthUserForFundCall = await integrationManager.isAuthUserForFund(comptrollerProxy, fundOwner);

    expect(isAuthUserForFundCall).toBe(true);
  });
});

describe('receiveCallFromComptroller', () => {
  it('reverts if the action received is invalid', async () => {
    const {
      deployment: { externalPositionManager },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    const callArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);
    // Call not allowed by the non authorized user
    await expect(
      comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(externalPositionManager, Object.keys(ExternalPositionManagerActionId).length + 1, callArgs),
    ).rejects.toBeRevertedWith('Invalid _actionId');
  });

  describe('action: createExternalPosition', () => {
    it('only allows authorized users', async () => {
      const {
        accounts: [newAuthUser],
        deployment: { externalPositionManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      const callArgs = encodeArgs(['uint256', 'bytes'], [0, '0x']);

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs),
      ).resolves.toBeReceipt();

      // Call not allowed by the non authorized user
      await expect(
        comptrollerProxy
          .connect(newAuthUser)
          .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs),
      ).rejects.toBeRevertedWith('Only the fund owner can call this function');
    });

    it('reverts if it receives an invalid typeId', async () => {
      const {
        deployment: { externalPositionManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      const callArgs = encodeArgs(['uint256', 'bytes'], [1, '0x']);

      // Call not allowed by the non authorized user
      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.CreateExternalPosition, callArgs),
      ).rejects.toBeRevertedWith('Invalid typeId');
    });
  });

  describe('action: removeExternalPosition', () => {
    it('works as expected when removing a external position', async () => {
      const {
        deployment: { externalPositionManager },
        fund: { comptrollerProxy, vaultProxy, fundOwner },
      } = await provider.snapshot(snapshot);

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

      const removePositionCallArgs = externalPositionRemoveArgs({
        externalPositionProxy: activeExternalPositionsBefore[0],
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

      const activeExternalPositionsAfter = await vaultProxy.getActiveExternalPositions.call();

      expect(activeExternalPositionsBefore.length - activeExternalPositionsAfter.length).toEqual(1);
    });
  });
});
