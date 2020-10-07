import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { utils } from 'ethers';
import { defaultTestDeployment } from '../../..';
import { IExtension } from '../../../codegen/IExtension';
import { IPrimitivePriceFeed } from '../../../codegen/IPrimitivePriceFeed';
import { ComptrollerLib, VaultLib } from '../../../utils/contracts';
import { createComptrollerProxy, fundStatusTypes } from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, config } = await defaultTestDeployment(provider);

  const [fundDeployerSigner, ...remainingAccounts] = accounts;

  const mockPrimitivePriceFeed = await IPrimitivePriceFeed.mock(
    config.deployer,
  );
  await mockPrimitivePriceFeed.isSupportedAsset.returns(false);
  const supportedAssetAddress = randomAddress();
  await mockPrimitivePriceFeed.isSupportedAsset
    .given(supportedAssetAddress)
    .returns(true);

  const mockFeeManager = await IExtension.mock(config.deployer);
  const mockPolicyManager = await IExtension.mock(config.deployer);

  await Promise.all([
    mockFeeManager.setConfigForFund.returns(undefined),
    mockFeeManager.activateForFund.returns(undefined),
    mockFeeManager.deactivateForFund.returns(undefined),
    mockPolicyManager.setConfigForFund.returns(undefined),
    mockPolicyManager.activateForFund.returns(undefined),
    mockPolicyManager.deactivateForFund.returns(undefined),
  ]);

  const comptrollerLib = await ComptrollerLib.deploy(
    config.deployer,
    fundDeployerSigner,
    randomAddress(), // ValueInterpreter
    mockPrimitivePriceFeed,
    randomAddress(), // DerivativePriceFeed
    mockFeeManager,
    randomAddress(), // IntegrationManager
    mockPolicyManager,
    randomAddress(), // Engine
  );

  return {
    accounts: remainingAccounts,
    config,
    comptrollerLib,
    fundDeployerSigner,
    mockFeeManager,
    mockPolicyManager,
    mockPrimitivePriceFeed,
    supportedAssetAddress,
  };
}

async function snapshotWithFundContracts(provider: EthereumTestnetProvider) {
  const {
    accounts,
    config,
    comptrollerLib,
    fundDeployerSigner,
    mockFeeManager,
    mockPolicyManager,
    mockPrimitivePriceFeed,
    supportedAssetAddress,
  } = await snapshot(provider);

  // Deploy ComptrollerProxy
  const { comptrollerProxy } = await createComptrollerProxy({
    signer: fundDeployerSigner,
    comptrollerLib,
    denominationAsset: supportedAssetAddress,
    feeManagerConfigData: utils.hexlify(utils.randomBytes(4)),
    policyManagerConfigData: utils.hexlify(utils.randomBytes(8)),
  });

  // Mock VaultProxy
  const [mockVaultProxyOwner, ...remainingAccounts] = accounts;
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.balanceOf.returns(0);
  await mockVaultProxy.getOwner.returns(mockVaultProxyOwner);
  await mockVaultProxy.burnShares.returns(undefined);
  await mockVaultProxy.mintShares.returns(undefined);

  return {
    accounts: remainingAccounts,
    config,
    comptrollerLib,
    comptrollerProxy,
    fundDeployerSigner,
    mockFeeManager,
    mockPolicyManager,
    mockPrimitivePriceFeed,
    mockVaultProxy,
    mockVaultProxyOwner,
    supportedAssetAddress,
  };
}

describe('init', () => {
  it('can only be called by FundDeployer', async () => {
    const {
      accounts: { 0: randomUser },
      comptrollerLib,
    } = await provider.snapshot(snapshot);

    const initTx = comptrollerLib
      .connect(randomUser)
      .init(randomAddress(), '0x', '0x');
    await expect(initTx).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );
  });

  it('does not allow an unsupported denomination asset', async () => {
    const { comptrollerLib, fundDeployerSigner } = await provider.snapshot(
      snapshot,
    );

    const initTx = comptrollerLib
      .connect(fundDeployerSigner)
      .init(randomAddress(), '0x', '0x');
    await expect(initTx).rejects.toBeRevertedWith(
      'Denomination asset must be a supported primitive',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerLib,
      fundDeployerSigner,
      mockFeeManager,
      mockPolicyManager,
      mockPrimitivePriceFeed,
      supportedAssetAddress,
    } = await provider.snapshot(snapshot);

    const denominationAsset = supportedAssetAddress;
    const feeManagerConfigData = utils.hexlify(utils.randomBytes(4));
    const policyManagerConfigData = utils.hexlify(utils.randomBytes(8));

    const { comptrollerProxy } = await createComptrollerProxy({
      signer: fundDeployerSigner,
      comptrollerLib,
      denominationAsset,
      feeManagerConfigData,
      policyManagerConfigData,
    });

    // Assert state has been set
    const initializedCall = comptrollerProxy.getInitialized();
    await expect(initializedCall).resolves.toBe(true);

    const getDenominationAssetCall = comptrollerProxy.getDenominationAsset();
    await expect(getDenominationAssetCall).resolves.toBe(denominationAsset);

    // Assert expected calls
    expect(
      mockPrimitivePriceFeed.isSupportedAsset,
    ).toHaveBeenCalledOnContractWith(supportedAssetAddress);
    expect(mockFeeManager.setConfigForFund).toHaveBeenCalledOnContractWith(
      feeManagerConfigData,
    );
    expect(mockPolicyManager.setConfigForFund).toHaveBeenCalledOnContractWith(
      policyManagerConfigData,
    );
  });
});

describe('activate', () => {
  it('can only be called by FundDeployer', async () => {
    const {
      accounts: { 0: randomUser },
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithFundContracts);

    const activateTx = comptrollerProxy
      .connect(randomUser)
      .activate(randomAddress(), false);
    await expect(activateTx).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );
  });

  it('correctly handles valid call (new fund)', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithFundContracts);

    const activateTx = comptrollerProxy.activate(mockVaultProxy, false);
    await expect(activateTx).resolves.toBeReceipt();

    // Assert state has been set
    const vaultProxyCall = comptrollerProxy.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(mockVaultProxy.address);

    const getStatusCall = comptrollerProxy.getStatus();
    await expect(getStatusCall).resolves.toBe(fundStatusTypes.Active);

    // Assert expected calls
    expect(mockFeeManager.activateForFund).toHaveBeenCalledOnContract();

    // Should not have called the path for activation of migrated funds
    expect(mockVaultProxy.balanceOf).not.toHaveBeenCalledOnContract();

    // Assert events emitted
    await assertEvent(activateTx, 'VaultProxySet', {
      vaultProxy: mockVaultProxy.address,
    });

    await assertEvent(activateTx, 'StatusUpdated', {
      nextStatus: fundStatusTypes.Active,
    });
  });

  it('correctly handles valid call (migrated fund)', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockPolicyManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithFundContracts);

    // Mock shares due balance to trigger migration logic
    const sharesDue = 100;
    await mockVaultProxy.balanceOf
      .given(mockVaultProxy.address)
      .returns(sharesDue);

    const activateTx = comptrollerProxy.activate(mockVaultProxy, true);
    await expect(activateTx).resolves.toBeReceipt();

    // Assert state has been set
    const vaultProxyCall = comptrollerProxy.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(mockVaultProxy.address);

    const getStatusCall = comptrollerProxy.getStatus();
    await expect(getStatusCall).resolves.toBe(fundStatusTypes.Active);

    // Assert expected calls
    expect(mockVaultProxy.burnShares).toHaveBeenCalledOnContractWith(
      mockVaultProxy.address,
      sharesDue,
    );

    expect(mockFeeManager.activateForFund).toHaveBeenCalledOnContract();

    expect(mockPolicyManager.activateForFund).toHaveBeenCalledOnContract();

    // Assert events emitted
    await assertEvent(activateTx, 'VaultProxySet', {
      vaultProxy: mockVaultProxy.address,
    });

    await assertEvent(activateTx, 'StatusUpdated', {
      nextStatus: fundStatusTypes.Active,
    });
  });
});

describe('shutdown', () => {
  it('cannot be called by a random user', async () => {
    const {
      accounts: { 0: randomUser },
      comptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithFundContracts);

    // Activate fund
    await comptrollerProxy.activate(mockVaultProxy, false);

    // Attempt to shutdown fund with a random user fails
    const shutdownTx = comptrollerProxy.connect(randomUser).shutdown();
    await expect(shutdownTx).rejects.toBeRevertedWith(
      'Only the fund owner can call this function',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      mockVaultProxyOwner,
    } = await provider.snapshot(snapshotWithFundContracts);

    // Activate fund
    await comptrollerProxy.activate(mockVaultProxy, false);

    // Shutdown fund
    const shutdownTx = comptrollerProxy.connect(mockVaultProxyOwner).shutdown();
    await expect(shutdownTx).resolves.toBeReceipt();

    // Assert state has been set
    const getStatusCall = comptrollerProxy.getStatus();
    await expect(getStatusCall).resolves.toBe(fundStatusTypes.Shutdown);

    // Assert expected calls
    expect(mockFeeManager.deactivateForFund).toHaveBeenCalledOnContract();

    // Assert events emitted
    await assertEvent(shutdownTx, 'StatusUpdated', {
      nextStatus: fundStatusTypes.Shutdown,
    });
  });
});

describe('destruct', () => {
  it('can only be called by FundDeployer', async () => {
    const {
      accounts: { 0: randomUser },
      comptrollerProxy,
    } = await provider.snapshot(snapshotWithFundContracts);

    const destructTx = comptrollerProxy.connect(randomUser).destruct();
    await expect(destructTx).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      fundDeployerSigner,
      mockFeeManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithFundContracts);

    // Activate fund
    await comptrollerProxy.activate(mockVaultProxy, false);

    // Confirm that getStatus call resolves prior to destruct
    const preGetStatusCall = comptrollerProxy.getStatus();
    await expect(preGetStatusCall).resolves.toBeTruthy();

    // Destruct fund
    const destructTx = comptrollerProxy.connect(fundDeployerSigner).destruct();
    await expect(destructTx).resolves.toBeReceipt();

    // Assert state has been wiped by assuring getStatus call now reverts
    const postGetStatusCall = comptrollerProxy.getStatus();
    await expect(postGetStatusCall).rejects.toBeReverted();

    // Assert expected calls
    expect(mockFeeManager.deactivateForFund).toHaveBeenCalledOnContract();
  });
});
