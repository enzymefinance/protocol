import { randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  debtPositionCallArgs,
  debtPositionRemoveArgs,
  DebtPositionManagerActionId,
  VaultLib,
  WETH,
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
      deployment: { aggregatedDerivativePriceFeed, chainlinkPriceFeed, compoundPriceFeed, debtPositionManager },
    } = await provider.snapshot(snapshot);

    const getDerivativePriceFeedCall = await debtPositionManager.getDerivativePriceFeed();
    expect(getDerivativePriceFeedCall).toMatchAddress(aggregatedDerivativePriceFeed);

    const getPrimitivePriceFeedCall = await debtPositionManager.getPrimitivePriceFeed();
    expect(getPrimitivePriceFeedCall).toMatchAddress(chainlinkPriceFeed);

    const getCompoundPriceFeedCall = await debtPositionManager.getCompoundPriceFeed();
    expect(getCompoundPriceFeedCall).toMatchAddress(compoundPriceFeed);
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
      deployment: { debtPositionManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    await mockComptrollerProxy.getVaultProxy.returns(constants.AddressZero);

    await expect(mockComptrollerProxy.forward(debtPositionManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Missing vaultProxy',
    );
  });

  it('does not allow a vaultProxy for which the sender is not the accessor', async () => {
    const {
      deployment: { debtPositionManager },
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    await mockVaultProxy.getAccessor.returns(randomAddress());

    await expect(mockComptrollerProxy.forward(debtPositionManager.activateForFund, false)).rejects.toBeRevertedWith(
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

describe('deactivateForFund', () => {
  it('correctly handles a valid call', async () => {
    const {
      deployment: { debtPositionManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    // Activate the fund
    await mockComptrollerProxy.forward(debtPositionManager.activateForFund, false);

    // Deactivate the fund
    await mockComptrollerProxy.forward(debtPositionManager.deactivateForFund);

    // The ComptrollerProxy-VaultProxy pairing should be deleted
    const getVaultProxyForFundCall = await debtPositionManager.getVaultProxyForFund(mockComptrollerProxy);

    expect(getVaultProxyForFundCall).toMatchAddress(constants.AddressZero);
  });
});

describe('debt position actions', () => {
  describe('createDebtPosition', () => {
    it('only allows authorized users', async () => {
      const {
        accounts: [newAuthUser],
        deployment: { debtPositionManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      const callArgs = debtPositionCallArgs({ protocol: 0, encodedCallArgs: '0x' });

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CreateDebtPosition, callArgs),
      ).resolves.toBeReceipt();

      // Call not allowed by the non authorized user
      await expect(
        comptrollerProxy
          .connect(newAuthUser)
          .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CreateDebtPosition, callArgs),
      ).rejects.toBeRevertedWith('Only the fund owner can call this function');
    });
  });

  describe('removeDebtPosition', () => {
    it('works as expected when removing a debt position', async () => {
      const {
        deployment: { debtPositionManager },
        fund: { comptrollerProxy, vaultProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      const createPositionCallArgs = debtPositionCallArgs({ protocol: 0, encodedCallArgs: '0x' });

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(debtPositionManager, DebtPositionManagerActionId.CreateDebtPosition, createPositionCallArgs),
      ).resolves.toBeReceipt();

      const activeDebtPositionsBefore = await vaultProxy.getActiveDebtPositions.call();

      const removePositionCallArgs = debtPositionRemoveArgs({ debtPosition: activeDebtPositionsBefore[0] });

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(debtPositionManager, DebtPositionManagerActionId.RemoveDebtPosition, removePositionCallArgs),
      ).resolves.toBeReceipt();

      const activeDebtPositionsAfter = await vaultProxy.getActiveDebtPositions.call();

      expect(activeDebtPositionsBefore.length - activeDebtPositionsAfter.length).toEqual(1);
    });
  });
});
