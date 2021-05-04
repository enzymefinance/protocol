import { SignerWithAddress } from '@enzymefinance/hardhat';
import { AddressLike, extractEvent, randomAddress } from '@enzymefinance/ethers';
import { StandardToken, VaultLib, VaultProxy, encodeFunctionData } from '@enzymefinance/protocol';
import {
  addTrackedAssetsToVault,
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function createVaultProxy({
  signer,
  vaultLib,
  fundOwner,
  fundAccessor,
  fundName = 'My Fund',
}: {
  signer: SignerWithAddress;
  vaultLib: VaultLib;
  fundOwner: AddressLike;
  fundAccessor: SignerWithAddress;
  fundName?: string;
}) {
  const constructData = encodeFunctionData(vaultLib.init.fragment, [fundOwner, fundAccessor, fundName]);

  const vaultProxyContract = await VaultProxy.deploy(signer, constructData, vaultLib);

  return new VaultLib(vaultProxyContract, fundAccessor);
}

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('receive', () => {
  it('immediately wraps ETH as WETH', async () => {
    const [fundOwner] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, provider);

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Send ETH to the VaultProxy
    const ethAmount = utils.parseEther('2');
    await fundOwner.sendTransaction({
      to: vaultProxy.address,
      value: ethAmount,
    });

    // VaultProxy ETH balance should be 0 and WETH balance should be the sent ETH amount
    expect(await provider.getBalance(vaultProxy.address)).toEqBigNumber(0);
    expect(await weth.balanceOf(vaultProxy)).toEqBigNumber(ethAmount);
  });
});

describe('init', () => {
  it('correctly sets initial proxy values', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'My Fund',
    });

    const accessorValue = await vaultProxy.getAccessor();
    expect(accessorValue).toMatchAddress(comptrollerProxy);

    const creatorValue = await vaultProxy.getCreator();
    expect(creatorValue).toMatchAddress(fork.deployment.dispatcher);

    const migratorValue = await vaultProxy.getMigrator();
    expect(migratorValue).toMatchAddress(constants.AddressZero);

    const ownerValue = await vaultProxy.getOwner();
    expect(ownerValue).toMatchAddress(fundOwner);

    const trackedAssetsValue = await vaultProxy.getTrackedAssets();
    expect(trackedAssetsValue).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [fork.config.weth]);

    // SharesToken values

    const nameValue = await vaultProxy.name();
    expect(nameValue).toBe('My Fund');

    const symbolValue = await vaultProxy.symbol();
    expect(symbolValue).toBe('ENZF');

    const decimalsValue = await vaultProxy.decimals();
    expect(decimalsValue).toBe(18);
  });
});

describe('addTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(vaultProxy.connect(fundOwner).addTrackedAsset(fork.config.weth, false)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.addTrackedAsset(vaultProxy, false)).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('does not allow exceeding the tracked assets limit', async () => {
    const [fundOwner] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const integrationManager = fork.deployment.integrationManager;

    // Create a new fund
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const assets = [
      new StandardToken(fork.config.primitives.bat, whales.bat),
      new StandardToken(fork.config.primitives.bnb, whales.bnb),
      new StandardToken(fork.config.primitives.bnt, whales.bnt),
      new StandardToken(fork.config.primitives.comp, whales.comp),
      new StandardToken(fork.config.primitives.dai, whales.dai),
      new StandardToken(fork.config.primitives.knc, whales.knc),
      new StandardToken(fork.config.primitives.link, whales.link),
      new StandardToken(fork.config.primitives.mana, whales.mana),
      new StandardToken(fork.config.primitives.mln, whales.mln),
      new StandardToken(fork.config.primitives.rep, whales.rep),
      new StandardToken(fork.config.primitives.ren, whales.ren),
      new StandardToken(fork.config.primitives.uni, whales.uni),
      new StandardToken(fork.config.primitives.usdc, whales.usdc),
      new StandardToken(fork.config.primitives.usdt, whales.usdt),
      new StandardToken(fork.config.primitives.zrx, whales.zrx),
      new StandardToken(fork.config.compound.ctokens.czrx, whales.czrx),
      new StandardToken(fork.config.compound.ctokens.ccomp, whales.ccomp),
      new StandardToken(fork.config.compound.ctokens.cusdc, whales.cusdc),
      new StandardToken(fork.config.synthetix.susd, whales.susd),
    ];

    // Seed with 19 assets to reach the max assets limit
    // (since the denomination asset is already tracked).
    await addTrackedAssetsToVault({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets,
    });

    // Use this loop instead of addNewAssetsToFund() to make debugging easier
    // when a whale changes.
    for (const asset of assets) {
      const decimals = await asset.decimals();
      const transferAmount = utils.parseUnits('1', decimals);
      await asset.transfer(vaultProxy, transferAmount);

      const balance = await asset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(transferAmount);
    }

    // Adding a new asset should fail
    await expect(
      addTrackedAssetsToVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [new StandardToken(fork.config.compound.ctokens.cuni, provider)],
      }),
    ).rejects.toBeRevertedWith('Limit exceeded');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const asset1 = randomAddress();
    const asset2 = randomAddress();
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Assert initial tracked assets state
    expect((await vaultProxy.getTrackedAssets()).length).toBe(0);
    expect(await vaultProxy.isTrackedAsset(asset1)).toBe(false);
    expect(await vaultProxy.isTrackedAsset(asset2)).toBe(false);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset1)).toBe(false);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset2)).toBe(false);

    // Call with a new asset, do NOT make it persistently tracked
    const receipt1 = await vaultProxy.addTrackedAsset(asset1, false);

    expect(await vaultProxy.isTrackedAsset(asset1)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset1)).toBe(false);

    assertEvent(receipt1, 'TrackedAssetAdded', {
      asset: asset1,
    });
    expect(extractEvent(receipt1, 'PersistentlyTrackedAssetAdded').length).toBe(0);

    // Call with the same asset, make it persistently tracked
    const receipt2 = await vaultProxy.addTrackedAsset(asset1, true);

    expect(await vaultProxy.isTrackedAsset(asset1)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset1)).toBe(true);

    assertEvent(receipt2, 'PersistentlyTrackedAssetAdded', {
      asset: asset1,
    });
    expect(extractEvent(receipt2, 'TrackedAssetAdded').length).toBe(0);

    // Call with another new asset, make it persistently tracked
    const receipt3 = await vaultProxy.addTrackedAsset(asset2, true);

    expect(await vaultProxy.isTrackedAsset(asset2)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset2)).toBe(true);

    assertEvent(receipt3, 'PersistentlyTrackedAssetAdded', {
      asset: asset2,
    });
    assertEvent(receipt3, 'TrackedAssetAdded', {
      asset: asset2,
    });

    // Assert the final state
    expect(await vaultProxy.getTrackedAssets()).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [asset1, asset2]);
    expect(await vaultProxy.isTrackedAsset(asset1)).toBe(true);
    expect(await vaultProxy.isTrackedAsset(asset2)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset1)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset2)).toBe(true);
  });
});

describe('allowUntrackingAssets', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.connect(fundOwner).allowUntrackingAssets([randomAddress()])).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const assetsToAllowUntracking = [randomAddress(), randomAddress()];
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Track the assets and make them persistently tracked
    for (const asset of assetsToAllowUntracking) {
      await vaultProxy.addTrackedAsset(asset, true);
      expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(true);
    }

    // Allow untracking the assets, unsetting them as persistently tracked
    const receipt = await vaultProxy.allowUntrackingAssets(assetsToAllowUntracking);

    // Assert the assets are still tracked but are not set as persistently tracked
    for (const asset of assetsToAllowUntracking) {
      expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(false);
      expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);
    }

    // Assert the correct events were emitted
    const events = extractEvent(receipt, 'PersistentlyTrackedAssetRemoved');
    expect(events.length).toBe(assetsToAllowUntracking.length);
    for (const i in assetsToAllowUntracking) {
      expect(events[i]).toMatchEventArgs({
        asset: assetsToAllowUntracking[i],
      });
    }
  });
});

describe('removeTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, arbitraryUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(
      vaultProxy.connect(arbitraryUser).removeTrackedAsset(fork.config.weth, false),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const asset = randomAddress();
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Call with an untracked asset that is NOT set as permanently tracked (should fail silently)
    const receipt1 = await vaultProxy.removeTrackedAsset(asset, true);

    expect(extractEvent(receipt1, 'PersistentlyTrackedAssetRemoved').length).toBe(0);
    expect(extractEvent(receipt1, 'TrackedAssetRemoved').length).toBe(0);

    // Call with a tracked asset that is NOT set as permanently tracked, and do NOT specify to unset as permanently tracked
    await vaultProxy.addTrackedAsset(asset, true);
    const receipt2 = await vaultProxy.removeTrackedAsset(asset, false);

    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(true);

    expect(extractEvent(receipt2, 'PersistentlyTrackedAssetRemoved').length).toBe(0);
    expect(extractEvent(receipt2, 'TrackedAssetRemoved').length).toBe(0);

    // Call with a tracked asset that is NOT set as permanently tracked, and specify to unset as permanently tracked
    await vaultProxy.addTrackedAsset(asset, true);
    const receipt3 = await vaultProxy.removeTrackedAsset(asset, true);

    expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);
    expect(await vaultProxy.isPersistentlyTrackedAsset(asset)).toBe(false);

    assertEvent(receipt3, 'PersistentlyTrackedAssetRemoved', {
      asset: asset,
    });
    assertEvent(receipt3, 'TrackedAssetRemoved', {
      asset: asset,
    });
  });
});

describe('addDebtPosition', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, arbitraryUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(vaultProxy.connect(arbitraryUser).addDebtPosition(randomAddress())).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
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

    const [debtPositionAddress1, debtPositionAddress2] = [randomAddress(), randomAddress()];

    const receipt = await vaultProxy.addDebtPosition(debtPositionAddress1);
    await vaultProxy.addDebtPosition(debtPositionAddress2);

    assertEvent(receipt, 'DebtPositionAdded', {
      debtPosition: debtPositionAddress1,
    });

    const debtPositions = await vaultProxy.getActiveDebtPositions();
    expect(debtPositions).toMatchFunctionOutput(vaultProxy.getActiveDebtPositions, [
      debtPositionAddress1,
      debtPositionAddress2,
    ]);

    const isActiveDebtPosition1 = await vaultProxy.isActiveDebtPosition(debtPositionAddress1);
    const isActiveDebtPosition2 = await vaultProxy.isActiveDebtPosition(debtPositionAddress2);

    expect(isActiveDebtPosition1).toBe(true);
    expect(isActiveDebtPosition2).toBe(true);
  });
});

describe('callOnDebtPosition', () => {
  it.todo('write tests');
});

describe('removeDebtPosition', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, arbitraryUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(vaultProxy.connect(arbitraryUser).removeDebtPosition(randomAddress())).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
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

    const [debtPositionAddress] = [randomAddress()];

    await vaultProxy.addDebtPosition(debtPositionAddress);
    await vaultProxy.removeDebtPosition(debtPositionAddress);

    const debtPositions = await vaultProxy.getActiveDebtPositions();
    expect(debtPositions).toMatchFunctionOutput(vaultProxy.getActiveDebtPositions, []);

    const isActiveDebtPosition = await vaultProxy.isActiveDebtPosition(debtPositionAddress);

    expect(isActiveDebtPosition).toBe(false);
  });
});

describe('withdrawAssetTo', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor, arbitraryUser] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).withdrawAssetTo(fork.config.weth, randomAddress(), utils.parseEther('2')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.withdrawAssetTo(vaultProxy, randomAddress(), 1)).rejects.toBeRevertedWith(
      'Cannot act on shares',
    );
  });

  it('works as expected: partial amount with asset that can be untracked', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const asset = new StandardToken(fork.config.weth, whales.weth);
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Seed the vault with the asset and add it as a removable tracked asset
    const amountToTransfer = await getAssetUnit(asset);
    await asset.transfer(vaultProxy, amountToTransfer);
    await vaultProxy.addTrackedAsset(asset, false);

    // Withdraw a partial amount of asset
    const preTxAssetBalance = await asset.balanceOf(vaultProxy);
    const amount = preTxAssetBalance.div(3);
    const target = randomAddress();
    const receipt = await vaultProxy.withdrawAssetTo(asset, target, amount);

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
    const asset = new StandardToken(fork.config.weth, whales.weth);
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Seed the vault with the asset and add it as a removable tracked asset
    const amountToTransfer = await getAssetUnit(asset);
    await asset.transfer(vaultProxy, amountToTransfer);
    await vaultProxy.addTrackedAsset(asset, false);

    // Withdraw the full amount of the asset
    await vaultProxy.withdrawAssetTo(asset, randomAddress(), amountToTransfer);

    // Assert the asset to no longer be tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);
  });

  it('works as expected: full amount with asset that can NOT be untracked', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const asset = new StandardToken(fork.config.weth, whales.weth);
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    // Seed the vault with the asset and add it as a non-untrackable asset
    const amountToTransfer = await getAssetUnit(asset);
    await asset.transfer(vaultProxy, amountToTransfer);
    await vaultProxy.addTrackedAsset(asset, true);

    // Withdraw the full amount of the asset
    await vaultProxy.withdrawAssetTo(asset, randomAddress(), amountToTransfer);

    // Assert the asset is still tracked
    expect(await vaultProxy.isTrackedAsset(asset)).toBe(true);
  });
});

describe('approveAssetSpender', () => {
  it('can only be called by the accessor', async () => {
    const [arbitraryUser, fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).approveAssetSpender(fork.config.weth, investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.approveAssetSpender(vaultProxy, randomAddress(), 1)).rejects.toBeRevertedWith(
      'Cannot act on shares',
    );
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const amount = utils.parseEther('1');

    const receipt = await vaultProxy.approveAssetSpender(weth, investor, amount);
    assertEvent(receipt, 'Approval', {
      owner: vaultProxy,
      spender: investor,
      value: amount,
    });

    const allowance = await weth.allowance(vaultProxy, investor);
    expect(allowance).toEqBigNumber(amount);
  });
});

describe('mintShares', () => {
  it('can only be called by the accessor', async () => {
    const [arbitraryUser, fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).mintShares(investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow mint to a zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.mintShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'mint to the zero address',
    );
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const preTxTotalSupply = await vaultProxy.totalSupply();
    expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

    const amount = utils.parseEther('1');

    const receipt = await vaultProxy.mintShares(investor, amount);
    assertEvent(receipt, 'Transfer', {
      from: constants.AddressZero,
      to: investor,
      value: amount,
    });

    const postTxTotalSupply = await vaultProxy.totalSupply();
    expect(postTxTotalSupply).toEqBigNumber(amount);

    const investorShares = await vaultProxy.balanceOf(investor);
    expect(investorShares).toEqBigNumber(amount);
  });
});

describe('burnShares', () => {
  it('can only be called by the accessor', async () => {
    const [arbitraryUser, fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).burnShares(investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow burn from a zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.burnShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'burn from the zero address',
    );
  });

  it('does not allow burn amount exceeds balance', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    await expect(vaultProxy.burnShares(investor, amount.add(BigNumber.from(1)))).rejects.toBeRevertedWith(
      'burn amount exceeds balance',
    );
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    const receipt = await vaultProxy.burnShares(investor, amount);
    assertEvent(receipt, 'Transfer', {
      from: investor,
      to: constants.AddressZero,
      value: amount,
    });

    const totalSupply = await vaultProxy.totalSupply();
    expect(totalSupply).toEqBigNumber(utils.parseEther('0'));

    const investorShares = await vaultProxy.balanceOf(investor);
    expect(investorShares).toEqBigNumber(utils.parseEther('0'));
  });
});

describe('transferShares', () => {
  it('can only be called by the accessor', async () => {
    const [arbitraryUser, fundOwner, investor1, investor2] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor: fork.deployer,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).transferShares(investor1, investor2, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow sender is an zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.transferShares(constants.AddressZero, randomAddress(), BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer from the zero address');
  });

  it('does not allow recipient is an zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.transferShares(randomAddress(), constants.AddressZero, BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer to the zero address');
  });

  it('does not allow transfer amount to exceed balance', async () => {
    const [fundOwner, fundAccessor, investor1, investor2] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor1, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    await expect(
      vaultProxy.transferShares(investor1, investor2, amount.add(BigNumber.from(1))),
    ).rejects.toBeRevertedWith('transfer amount exceeds balance');
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor, investor1, investor2] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor1, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    const receipt = await vaultProxy.transferShares(investor1, investor2, amount);
    assertEvent(receipt, 'Transfer', {
      from: investor1,
      to: investor2,
      value: amount,
    });

    const investor1Shares = await vaultProxy.balanceOf(investor1);
    expect(investor1Shares).toEqBigNumber(BigNumber.from(0));

    const investor2Shares = await vaultProxy.balanceOf(investor2);
    expect(investor2Shares).toEqBigNumber(amount);
  });
});

describe('setNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.connect(randomUser).setNominatedOwner(randomAddress())).rejects.toBeRevertedWith(
      'Only the owner can call this function',
    );
  });

  it('does not allow an empty next owner address', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.setNominatedOwner(constants.AddressZero)).rejects.toBeRevertedWith(
      '_nextNominatedOwner cannot be empty',
    );
  });

  it('does not allow the next owner to be the current owner', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.setNominatedOwner(fundOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already the owner',
    );
  });

  it('does not allow the next owner to already be nominated', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Nominate the nextOwner a first time
    const nextOwner = randomAddress();
    await vaultProxy.setNominatedOwner(nextOwner);

    // Attempt to nominate the same nextOwner a second time
    await expect(vaultProxy.setNominatedOwner(nextOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already nominated',
    );
  });

  it('correctly handles nominating a new owner', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Nominate the nextOwner a first time
    const nextOwnerAddress = randomAddress();
    const receipt = await vaultProxy.setNominatedOwner(nextOwnerAddress);

    // NominatedOwnerSet event properly emitted
    assertEvent(receipt, 'NominatedOwnerSet', {
      nominatedOwner: nextOwnerAddress,
    });

    // New owner should have been nominated
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(nextOwnerAddress);

    // Ownership should not have changed
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(fundOwner);
  });
});

describe('removeNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(randomAddress());

    // Attempt by a random user to remove nominated owner should fail
    await expect(vaultProxy.connect(randomUser).removeNominatedOwner()).rejects.toBeRevertedWith(
      'Only the owner can call this function',
    );
  });

  it('correctly handles removing the nomination', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    const nextOwnerAddress = randomAddress();
    await vaultProxy.setNominatedOwner(nextOwnerAddress);

    // Attempt by a random user to remove nominated owner should fail
    const receipt = await vaultProxy.removeNominatedOwner();

    // NominatedOwnerRemoved event properly emitted
    assertEvent(receipt, 'NominatedOwnerRemoved', {
      nominatedOwner: nextOwnerAddress,
    });

    // Nomination should have been removed
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);

    // Ownership should not have changed
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(fundOwner);
  });
});

describe('claimOwnership', () => {
  it('can only be called by the nominatedOwner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(randomAddress());

    // Attempt by a random user to claim ownership should fail
    await expect(vaultProxy.connect(randomUser).claimOwnership()).rejects.toBeRevertedWith(
      'Only the nominatedOwner can call this function',
    );
  });

  it('correctly handles transferring ownership', async () => {
    const [fundOwner, nominatedOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(nominatedOwner);

    // Claim ownership
    const receipt = await vaultProxy.connect(nominatedOwner).claimOwnership();

    // OwnershipTransferred event properly emitted
    assertEvent(receipt, 'OwnershipTransferred', {
      prevOwner: fundOwner,
      nextOwner: nominatedOwner,
    });

    // Owner should now be the nominatedOwner
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(nominatedOwner);

    // nominatedOwner should be empty
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);
  });
});

// TODO: callOnContract
