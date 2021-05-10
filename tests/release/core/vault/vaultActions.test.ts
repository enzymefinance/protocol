import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { encodeArgs, StandardToken, VaultAction, VaultLib } from '@enzymefinance/protocol';
import {
  assertEvent,
  createVaultProxy,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('AddDebtPosition', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const debtPosition = randomAddress();

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddDebtPosition,
      encodeArgs(['address'], [debtPosition]),
    );

    // The debt position should be added to active debt positions
    expect(await vaultProxy.getActiveDebtPositions()).toMatchFunctionOutput(vaultProxy.getActiveDebtPositions, [
      debtPosition,
    ]);
    expect(await vaultProxy.isActiveDebtPosition(debtPosition)).toBe(true);

    // Assert that the correct event was emitted
    assertEvent(receipt, 'DebtPositionAdded', {
      debtPosition,
    });
  });
});

describe('AddPersistentlyTrackedAsset', () => {
  // Validations tested by AddTrackedAsset

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const asset = randomAddress();

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddPersistentlyTrackedAsset,
      encodeArgs(['address'], [asset]),
    );

    // The asset should be tracked, and permanently tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(true);

    // Assert that the correct events were emitted
    assertEvent(receipt, 'PersistentlyTrackedAssetAdded', {
      asset,
    });
    assertEvent(receipt, 'TrackedAssetAdded', {
      asset,
    });
  });
});

describe('AddTrackedAsset', () => {
  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [vaultProxy])),
    ).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('does not allow exceeding the tracked assets limit', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
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
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const asset = randomAddress();

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Add a random asset
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddTrackedAsset,
      encodeArgs(['address'], [asset]),
    );

    // The asset should be tracked, but not permanently tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(false);

    // Assert that only the correct event was emitted
    assertEvent(receipt, 'TrackedAssetAdded', {
      asset,
    });
    expect(extractEvent(receipt, 'PersistentlyTrackedAssetAdded').length).toBe(0);
  });
});

describe('ApproveAssetSpender', () => {
  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.receiveValidatedVaultAction(
        VaultAction.ApproveAssetSpender,
        encodeArgs(['address', 'address', 'uint256'], [vaultProxy, randomAddress(), 1]),
      ),
    ).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const spender = randomAddress();
    const asset = new StandardToken(fork.config.weth, provider);
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
  });
});

describe('BurnShares', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
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

describe('CallOnDebtPosition', () => {
  it.todo('write tests');
});

describe('MintShares', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
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

describe('RemoveDebtPosition', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const debtPositionToRemove = randomAddress();
    const debtPositionToRemain = randomAddress();

    // Add the debt position to be removed
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddDebtPosition,
      encodeArgs(['address'], [debtPositionToRemove]),
    );
    expect(await vaultProxy.isActiveDebtPosition(debtPositionToRemove)).toBe(true);

    // Add another debt position to remain
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddDebtPosition,
      encodeArgs(['address'], [debtPositionToRemain]),
    );

    // Remove the debt position
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveDebtPosition,
      encodeArgs(['address'], [debtPositionToRemove]),
    );

    // The debt position should be removed from active debt position
    expect(await vaultProxy.getActiveDebtPositions()).toMatchFunctionOutput(vaultProxy.getActiveDebtPositions, [
      debtPositionToRemain,
    ]);
    expect(await vaultProxy.isActiveDebtPosition(debtPositionToRemove)).toBe(false);

    // Assert that the correct event was emitted
    assertEvent(receipt, 'DebtPositionRemoved', {
      debtPosition: debtPositionToRemove,
    });
  });
});

describe('RemovePersistentlyTrackedAsset', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const asset = randomAddress();

    // Add persistently tracked asset to be removed
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddPersistentlyTrackedAsset,
      encodeArgs(['address'], [asset]),
    );
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);

    // Remove the persistently tracked asset
    const receipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemovePersistentlyTrackedAsset,
      encodeArgs(['address'], [asset]),
    );

    // The tracked asset should be removed from tracked assets and no longer be persistently tracked
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(false);
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);

    // Assert the correct events were emitted
    assertEvent(receipt, 'PersistentlyTrackedAssetRemoved', {
      asset,
    });
    assertEvent(receipt, 'TrackedAssetRemoved', {
      asset,
    });
  });
});

describe('RemoveTrackedAsset', () => {
  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const assetToRemove = randomAddress();
    const persistentlyTrackedAsset = randomAddress();

    // Call with an untracked asset should fail silently
    const untrackedAssetRemovalReceipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveTrackedAsset,
      encodeArgs(['address'], [assetToRemove]),
    );
    expect(extractEvent(untrackedAssetRemovalReceipt, 'TrackedAssetRemoved').length).toBe(0);

    // Add tracked asset to be removed
    await vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [assetToRemove]));

    // Add asset to remain as a persistently tracked asset
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddPersistentlyTrackedAsset,
      encodeArgs(['address'], [persistentlyTrackedAsset]),
    );

    expect(await vaultProxy.getTrackedAssets()).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [
      assetToRemove,
      persistentlyTrackedAsset,
    ]);

    // Attempting to remove the persistently tracked asset fails silently
    const persistentlyTrackedAssetRemovalReceipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveTrackedAsset,
      encodeArgs(['address'], [persistentlyTrackedAsset]),
    );
    expect(await vaultProxy.isTrackedAsset(persistentlyTrackedAsset)).toBe(true);
    expect(extractEvent(persistentlyTrackedAssetRemovalReceipt, 'TrackedAssetRemoved').length).toBe(0);

    // Remove the tracked asset
    const trackedAssetRemovalReceipt = await vaultProxy.receiveValidatedVaultAction(
      VaultAction.RemoveTrackedAsset,
      encodeArgs(['address'], [assetToRemove]),
    );

    // The tracked asset should be removed from tracked assets
    expect(await vaultProxy.getTrackedAssets()).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [
      persistentlyTrackedAsset,
    ]);
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
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
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
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.receiveValidatedVaultAction(
        VaultAction.WithdrawAssetTo,
        encodeArgs(['address', 'address', 'uint256'], [vaultProxy, randomAddress(), 1]),
      ),
    ).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('works as expected: partial amount with asset that can be untracked', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const asset = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Seed the vault with the asset and add it as a removable tracked asset
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
      asset,
      target,
      amount,
    });
  });

  it('works as expected: full amount with asset that can be untracked', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const asset = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Seed the vault with the asset and add it as a removable tracked asset
    const amountToTransfer = await getAssetUnit(asset);
    await asset.transfer(vaultProxy, amountToTransfer);
    await vaultProxy.receiveValidatedVaultAction(VaultAction.AddTrackedAsset, encodeArgs(['address'], [asset]));

    // Withdraw the full amount of the asset
    await vaultProxy.withdrawAssetTo(asset, randomAddress(), amountToTransfer);

    // Assert the asset to no longer be tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);
  });

  it('works as expected: full amount with asset that can NOT be untracked', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const asset = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Seed the vault with the asset and add it as a non-untrackable asset
    const amountToTransfer = await getAssetUnit(asset);
    await asset.transfer(vaultProxy, amountToTransfer);
    await vaultProxy.receiveValidatedVaultAction(
      VaultAction.AddPersistentlyTrackedAsset,
      encodeArgs(['address'], [asset]),
    );

    // Withdraw the full amount of the asset
    await vaultProxy.withdrawAssetTo(asset, randomAddress(), amountToTransfer);

    // Assert the asset is still tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);
  });
});
