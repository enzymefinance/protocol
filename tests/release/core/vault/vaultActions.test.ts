import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  encodeArgs,
  MockGenericExternalPositionLib,
  StandardToken,
  VaultAction,
  VaultLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  createMockExternalPosition,
  createNewFund,
  createVaultProxy,
  deployProtocolFixture,
  getAssetUnit,
  mockExternalPositionAddManagedAssets,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('AddExternalPosition', () => {
  it('does not allow exceeding the positions limit', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    // Add 19 tracked assets
    let i = 0;

    while (i < 19) {
      await vaultProxy.receiveValidatedVaultAction(
        VaultAction.AddTrackedAsset,
        encodeArgs(['address'], [randomAddress()]),
      );
      i++;
    }

    expect((await vaultProxy.getTrackedAssets()).length).toBe(19);

    // Add 1 external position
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddExternalPosition,
      encodeArgs(['address'], [randomAddress()]),
    );
    expect((await vaultProxy.getActiveExternalPositions()).length).toBe(1);

    // Adding a new external position should fail
    await expect(
      vaultProxy.receiveValidatedVaultAction(
        VaultAction.AddExternalPosition,
        encodeArgs(['address'], [randomAddress()]),
      ),
    ).rejects.toBeRevertedWith('Limit exceeded');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );
    const externalPosition = randomAddress();

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddExternalPosition,
      encodeArgs(['address'], [externalPosition]),
    );

    // The external position should be added to active external positions
    expect(await vaultProxy.getActiveExternalPositions()).toMatchFunctionOutput(vaultProxy.getActiveExternalPositions, [
      externalPosition,
    ]);
    expect(await vaultProxy.isActiveExternalPosition(externalPosition)).toBe(true);

    // Assert that the correct event was emitted
    assertEvent(receipt, 'ExternalPositionAdded', {
      externalPosition,
    });
  });
});

describe('AddTrackedAsset', () => {
  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    await expect(
      vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [vaultProxy])),
    ).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('does not allow exceeding the positions limit', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    // Add 20 tracked assets
    let i = 0;

    while (i < 20) {
      await vaultProxy.receiveValidatedVaultAction(
        VaultAction.AddTrackedAsset,
        encodeArgs(['address'], [randomAddress()]),
      );
      i++;
    }

    expect((await vaultProxy.getTrackedAssets()).length).toBe(20);

    // Adding a new asset should fail
    await expect(
      vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [randomAddress()])),
    ).rejects.toBeRevertedWith('Limit exceeded');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );
    const asset = randomAddress();

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    // Add a random asset
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddTrackedAsset,
      encodeArgs(['address'], [asset]),
    );

    // The asset should be tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);

    // Assert that only the correct event was emitted
    assertEvent(receipt, 'TrackedAssetAdded', {
      asset,
    });
  });
});

describe('ApproveAssetSpender', () => {
  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    await expect(
      vaultProxy.receiveValidatedVaultAction(
        VaultAction.ApproveAssetSpender,
        encodeArgs(['address', 'address', 'uint256'], [vaultProxy, randomAddress(), 1]),
      ),
    ).rejects.toBeRevertedWith('Cannot act on shares');
  });

  // Use USDT, as the function works with its idiosyncrasies
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    const spender = randomAddress();
    const asset = new StandardToken(fork.config.primitives.usdt, provider);
    const amount = utils.parseEther('1');

    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.ApproveAssetSpender,
      encodeArgs(['address', 'address', 'uint256'], [asset, spender, amount]),
    );

    // The allowance should be set for the asset
    expect(await asset.allowance(vaultProxy, spender)).toEqBigNumber(amount);

    // Assert the correct event was emitted
    assertEvent(receipt, 'Approval', {
      owner: vaultProxy,
      spender,
      value: amount,
    });

    // Granting a second approval should succeed and the allowance updated
    const newAmount = amount.add(1);

    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.ApproveAssetSpender,
      encodeArgs(['address', 'address', 'uint256'], [asset, spender, newAmount]),
    );
    expect(await asset.allowance(vaultProxy, spender)).toEqBigNumber(newAmount);
  });
});

describe('BurnShares', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    const target = randomAddress();

    // Mint shares to be burned later
    const mintAmount = utils.parseEther('1');

    await vaultProxy.connect(fundAccessor).mintShares(target, mintAmount);

    // Burn some of the shares
    const burnAmount = mintAmount.div(3);
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.BurnShares,
      encodeArgs(['address', 'uint256'], [target, burnAmount]),
    );

    // The correct number of shares should have been burned
    const finalSharesBalance = await vaultProxy.balanceOf(target);

    expect(finalSharesBalance).toEqBigNumber(mintAmount.sub(burnAmount));
    expect(await vaultProxy.totalSupply()).toEqBigNumber(finalSharesBalance);

    // Assert the correct event was emitted
    assertEvent(receipt, 'Transfer', {
      from: target,
      to: constants.AddressZero,
      value: burnAmount,
    });
  });
});

describe('CallOnExternalPosition', () => {
  it('works as expected', async () => {
    const [fundOwner] = fork.accounts;
    const externalPositionManager = fork.deployment.externalPositionManager;
    const externalPositionFactory = fork.deployment.externalPositionFactory;
    const seedAmount = utils.parseEther('1');

    const { vaultProxy, comptrollerProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const assetsToTransfer = [new StandardToken(fork.config.primitives.dai, whales.dai)];
    const assetsToReceive = [new StandardToken(fork.config.primitives.mln, whales.mln)];
    const amountsToTransfer = [1];

    await assetsToTransfer[0].transfer(vaultProxy, seedAmount);

    const { externalPositionProxy } = await createMockExternalPosition({
      comptrollerProxy,
      defaultActionAmountsToTransfer: amountsToTransfer,
      defaultActionAssetsToReceive: assetsToReceive,
      defaultActionAssetsToTransfer: assetsToTransfer,
      deployer: fork.deployer,
      externalPositionFactory,
      externalPositionManager,
      fundOwner,
    });

    await mockExternalPositionAddManagedAssets({
      amounts: [amountsToTransfer[0]],
      assets: [assetsToTransfer[0]],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy,
      signer: fundOwner,
    });

    // External position was properly called
    const externalPositionInstance = new MockGenericExternalPositionLib(externalPositionProxy, fork.deployer);

    expect((await externalPositionInstance.getManagedAssets.call()).assets_).toEqual([assetsToTransfer[0].address]);

    // VaultProxy transferred amounts to transfer
    expect(await assetsToTransfer[0].balanceOf(vaultProxy.address)).toEqBigNumber(seedAmount.sub(amountsToTransfer[0]));

    // Assets to receive are added as a new tracked asset at the vault
    expect(await vaultProxy.isTrackedAsset(assetsToReceive[0])).toBe(true);
  });
});

describe('MintShares', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    const target = randomAddress();
    const amount = utils.parseEther('1.1');

    // Mint shares
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.MintShares,
      encodeArgs(['address', 'uint256'], [target, amount]),
    );

    // The correct number of shares should have been minted
    const finalSharesBalance = await vaultProxy.balanceOf(target);

    expect(finalSharesBalance).toEqBigNumber(amount);
    expect(await vaultProxy.totalSupply()).toEqBigNumber(finalSharesBalance);

    // Assert the correct event was emitted
    assertEvent(receipt, 'Transfer', {
      from: constants.AddressZero,
      to: target,
      value: amount,
    });
  });
});

describe('RemoveExternalPosition', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    const externalPositionToRemove = randomAddress();
    const externalPositionToRemain = randomAddress();

    // Add the external position to be removed
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddExternalPosition,
      encodeArgs(['address'], [externalPositionToRemove]),
    );
    expect(await vaultProxy.isActiveExternalPosition(externalPositionToRemove)).toBe(true);

    // Add another external position to remain
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddExternalPosition,
      encodeArgs(['address'], [externalPositionToRemain]),
    );

    // Remove the external position
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveExternalPosition,
      encodeArgs(['address'], [externalPositionToRemove]),
    );

    // The external position should be removed from active external position
    expect(await vaultProxy.getActiveExternalPositions()).toMatchFunctionOutput(vaultProxy.getActiveExternalPositions, [
      externalPositionToRemain,
    ]);
    expect(await vaultProxy.isActiveExternalPosition(externalPositionToRemove)).toBe(false);

    // Assert that the correct event was emitted
    assertEvent(receipt, 'ExternalPositionRemoved', {
      externalPosition: externalPositionToRemove,
    });
  });
});

describe('RemoveTrackedAsset', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    const assetToRemove = randomAddress();

    // Call with an untracked asset should fail silently
    const untrackedAssetRemovalReceipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveTrackedAsset,
      encodeArgs(['address'], [assetToRemove]),
    );

    expect(extractEvent(untrackedAssetRemovalReceipt, 'TrackedAssetRemoved').length).toBe(0);

    // Add tracked asset to be removed
    await vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [assetToRemove]));
    expect(await vaultProxy.getTrackedAssets()).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [assetToRemove]);

    // Remove the tracked asset
    const trackedAssetRemovalReceipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveTrackedAsset,
      encodeArgs(['address'], [assetToRemove]),
    );

    // The tracked asset should be removed from tracked assets
    expect(await vaultProxy.getTrackedAssets()).toMatchFunctionOutput(vaultProxy.getTrackedAssets, []);
    expect(await vaultProxy.isTrackedAsset(assetToRemove)).toBe(false);

    // Assert the correct event was emitted
    assertEvent(trackedAssetRemovalReceipt, 'TrackedAssetRemoved', {
      asset: assetToRemove,
    });
  });
});

describe('TransferShares', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor, fromAccount, toAccount] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    // Mint shares to fromAccount
    const mintAmount = utils.parseEther('2');

    await vaultProxy.mintShares(fromAccount, mintAmount);

    // Transfer shares to toAccount
    const transferAmount = mintAmount.div(3);
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.TransferShares,
      encodeArgs(['address', 'address', 'uint256'], [fromAccount, toAccount, transferAmount]),
    );

    // The shares should have been transferred to toAccount with a constant supply
    expect(await vaultProxy.balanceOf(toAccount)).toEqBigNumber(transferAmount);
    expect(await vaultProxy.balanceOf(fromAccount)).toEqBigNumber(mintAmount.sub(transferAmount));
    expect(await vaultProxy.totalSupply()).toEqBigNumber(mintAmount);

    // Assert the correct event was emitted
    assertEvent(receipt, 'Transfer', {
      from: fromAccount,
      to: toAccount,
      value: transferAmount,
    });
  });
});

describe('WithdrawAssetTo', () => {
  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    await expect(
      vaultProxy.receiveValidatedVaultAction(
        VaultAction.WithdrawAssetTo,
        encodeArgs(['address', 'address', 'uint256'], [vaultProxy, randomAddress(), 1]),
      ),
    ).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(
      fork.deployer,
      fork.deployment.externalPositionManager,
      fork.deployment.gasRelayPaymasterFactory,
      fork.deployment.protocolFeeReserveProxy,
      fork.deployment.protocolFeeTracker,
      fork.config.feeToken,
      await fork.deployment.vaultLib.getMlnBurner(),
      fork.config.weth,
      fork.config.positionsLimit,
    );
    const asset = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      fundAccessor,
      fundOwner,
      signer: fork.deployer,
      vaultLib,
    });

    // Seed the vault with the asset
    const amountToTransfer = await getAssetUnit(asset);

    await asset.transfer(vaultProxy, amountToTransfer);
    await vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [asset]));

    // Withdraw a partial amount of asset
    const preTxAssetBalance = await asset.balanceOf(vaultProxy);
    const amount = preTxAssetBalance.div(3);
    const target = randomAddress();

    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.WithdrawAssetTo,
      encodeArgs(['address', 'address', 'uint256'], [asset, target, amount]),
    );

    // Assert the correct amount of the asset was transferred from vault to target
    expect(await asset.balanceOf(vaultProxy)).toEqBigNumber(preTxAssetBalance.sub(amount));
    expect(await asset.balanceOf(target)).toEqBigNumber(amount);

    // Assert the asset is still tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);

    // Assert the correct event was emitted
    assertEvent(receipt, 'AssetWithdrawn', {
      amount,
      asset,
      target,
    });
  });
});
