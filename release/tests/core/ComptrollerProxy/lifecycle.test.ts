import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { utils } from 'ethers';
import { defaultTestDeployment } from '../../..';
import { IExtension } from '../../../codegen/IExtension';
import {
  ComptrollerLib,
  FundDeployer,
  VaultLib,
} from '../../../utils/contracts';
import {
  createComptrollerProxy,
  fundStatusTypes,
  releaseStatusTypes,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, config, deployment } = await defaultTestDeployment(
    provider,
  );

  // Deploy a mock FundDeployer
  const mockFundDeployer = await FundDeployer.mock(config.deployer);
  await mockFundDeployer.getReleaseStatus.returns(releaseStatusTypes.Live);

  // Deploy mock extensions
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

  // Re-deploy a ComptrollerLib that uses the mocks
  const comptrollerLib = await ComptrollerLib.deploy(
    config.deployer,
    mockFundDeployer,
    randomAddress(), // ValueInterpreter
    deployment.chainlinkPriceFeed,
    randomAddress(), // DerivativePriceFeed
    mockFeeManager,
    randomAddress(), // IntegrationManager
    mockPolicyManager,
    randomAddress(), // Engine
  );

  // Deploy configured ComptrollerProxy
  const feeManagerConfigData = utils.hexlify(utils.randomBytes(4));
  const policyManagerConfigData = utils.hexlify(utils.randomBytes(8));
  const { comptrollerProxy } = await createComptrollerProxy({
    signer: config.deployer,
    comptrollerLib,
    denominationAsset: deployment.tokens.weth.address,
    feeManagerConfigData,
    policyManagerConfigData,
  });

  // Deploy Mock VaultProxy
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
    comptrollerProxy: comptrollerProxy.connect(mockVaultProxyOwner),
    feeManagerConfigData,
    mockFeeManager,
    mockFundDeployer,
    mockPolicyManager,
    mockVaultProxy,
    policyManagerConfigData,
    supportedAsset: deployment.tokens.weth,
  };
}

describe('init', () => {
  it('does not allow an unsupported denomination asset', async () => {
    const {
      config: { deployer: signer },
      comptrollerLib,
    } = await provider.snapshot(snapshot);

    const initTx = createComptrollerProxy({
      signer,
      comptrollerLib,
      denominationAsset: randomAddress(),
    });
    await expect(initTx).rejects.toBeRevertedWith(
      'Denomination asset must be a supported primitive',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      feeManagerConfigData,
      mockFeeManager,
      mockPolicyManager,
      policyManagerConfigData,
      supportedAsset: denominationAsset,
    } = await provider.snapshot(snapshot);

    // ComptrollerProxy has already been created (and init() called),
    // so we just need to assert state and expected calls

    // Assert state has been set
    const getDenominationAssetCall = comptrollerProxy.getDenominationAsset();
    await expect(getDenominationAssetCall).resolves.toBe(
      denominationAsset.address,
    );

    const getOverridePauseCall = comptrollerProxy.getOverridePause();
    await expect(getOverridePauseCall).resolves.toBe(false);

    // Assert expected calls
    expect(mockFeeManager.setConfigForFund).toHaveBeenCalledOnContractWith(
      feeManagerConfigData,
    );
    expect(mockPolicyManager.setConfigForFund).toHaveBeenCalledOnContractWith(
      policyManagerConfigData,
    );
  });

  it('can only be called once', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    // ComptrollerProxy has already been created (and init() called)

    const initTx = comptrollerProxy.init(randomAddress(), '0x', '0x');
    await expect(initTx).rejects.toBeRevertedWith('Already initialized');
  });
});

describe('activate', () => {
  it('can only be called by FundDeployer', async () => {
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    const activateTx = comptrollerProxy.activate(randomAddress(), false);
    await expect(activateTx).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );
  });

  it('correctly handles valid call (new fund)', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Call activate()
    const activateTx = mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );
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
      mockFundDeployer,
      mockPolicyManager,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Mock shares due balance to assert burn/mint calls during activation
    const sharesDue = 100;
    await mockVaultProxy.balanceOf
      .given(mockVaultProxy.address)
      .returns(sharesDue);

    // Call activate()
    const activateTx = mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      true,
    );
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
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // Attempt to shutdown fund with a random user fails
    const shutdownTx = comptrollerProxy.connect(randomUser).shutdown();
    await expect(shutdownTx).rejects.toBeRevertedWith(
      'Only the fund owner can call this function',
    );
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      comptrollerProxy,
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // // Mock ReleaseStatus.Pause
    await mockFundDeployer.getReleaseStatus.returns(releaseStatusTypes.Paused);

    // // The call should fail
    const badShutdownTx = comptrollerProxy.shutdown();
    await expect(badShutdownTx).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.setOverridePause(true);

    // // The call should then succeed
    const goodShutdownTx = comptrollerProxy.shutdown();
    await expect(goodShutdownTx).resolves.toBeReceipt();
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // Shutdown fund
    const shutdownTx = comptrollerProxy.shutdown();
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
    const { comptrollerProxy } = await provider.snapshot(snapshot);

    const destructTx = comptrollerProxy.destruct();
    await expect(destructTx).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      comptrollerProxy,
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // Mock ReleaseStatus.Pause
    await mockFundDeployer.getReleaseStatus.returns(releaseStatusTypes.Paused);

    // The call should fail
    const badDestructTx = mockFundDeployer.forward(comptrollerProxy.destruct);
    await expect(badDestructTx).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.setOverridePause(true);

    // The call should then succeed
    const goodDestructTx = mockFundDeployer.forward(comptrollerProxy.destruct);
    await expect(goodDestructTx).resolves.toBeReceipt();
  });

  it('correctly handles valid call', async () => {
    const {
      comptrollerProxy,
      mockFeeManager,
      mockFundDeployer,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await mockFundDeployer.forward(
      comptrollerProxy.activate,
      mockVaultProxy,
      false,
    );

    // Confirm that getStatus call resolves prior to destruct
    const preGetStatusCall = comptrollerProxy.getStatus();
    await expect(preGetStatusCall).resolves.toBeTruthy();

    // Destruct fund
    const destructTx = mockFundDeployer.forward(comptrollerProxy.destruct);
    await expect(destructTx).resolves.toBeReceipt();

    // Assert state has been wiped by assuring getStatus call now reverts
    const postGetStatusCall = comptrollerProxy.getStatus();
    await expect(postGetStatusCall).rejects.toBeReverted();

    // Assert expected calls
    expect(mockFeeManager.deactivateForFund).toHaveBeenCalledOnContract();
  });
});
