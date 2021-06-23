import { AddressLike, extractEvent, MockContract, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, FundDeployer, StandardToken, VaultLib } from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  createVaultProxy,
  deployProtocolFixture,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

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

describe('setAccessorForFundReconfiguration', () => {
  let vaultProxy: VaultLib;
  let mockFundDeployer: MockContract<FundDeployer>;
  let fundOwner: SignerWithAddress, mockAccessor: MockContract<ComptrollerLib>;
  let nextAccessor: AddressLike;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;

    // Create the VaultProxy instance via a mockFundDeployer set as the Dispatcher.currentFundDeployer
    // so that we can later call `setAccessorForFundReconfiguration()` directly from the mockFundDeployer.
    // mockAccessor can be any contract, necessary because the Dispatcher validates that it is a contract.
    const dispatcher = fork.deployment.dispatcher;
    mockFundDeployer = await FundDeployer.mock(fork.deployer);
    mockAccessor = await ComptrollerLib.mock(fork.deployer);

    await dispatcher.setCurrentFundDeployer(mockFundDeployer);

    const deployVaultProxyReceipt = await mockFundDeployer.forward(
      dispatcher.deployVaultProxy,
      await VaultLib.deploy(fork.deployer, fork.config.weth),
      fundOwner,
      mockAccessor,
      'Test',
    );
    const events = extractEvent(deployVaultProxyReceipt, dispatcher.abi.getEvent('VaultProxyDeployed'));

    vaultProxy = new VaultLib(events[0].args.vaultProxy, provider);
    nextAccessor = randomAddress();
  });

  it('cannot be called by the accessor or fund owner', async () => {
    const revertReason = 'Only the FundDeployer can make this call';
    await expect(
      vaultProxy.connect(fundOwner).setAccessorForFundReconfiguration(nextAccessor),
    ).rejects.toBeRevertedWith(revertReason);
    await expect(
      mockAccessor.forward(vaultProxy.setAccessorForFundReconfiguration, nextAccessor),
    ).rejects.toBeRevertedWith(revertReason);
  });

  it('correctly updates the accessor and emits the AccessorSet event', async () => {
    const prevAccessor = await vaultProxy.getAccessor();

    const receipt = await mockFundDeployer.forward(vaultProxy.setAccessorForFundReconfiguration, nextAccessor);

    expect(await vaultProxy.getAccessor()).toMatchAddress(nextAccessor);

    assertEvent(receipt, vaultProxy.abi.getEvent('AccessorSet'), {
      prevAccessor,
      nextAccessor,
    });
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
      await vaultProxy.addPersistentlyTrackedAsset(asset);
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

describe('callOnContract', () => {
  it.todo('write tests');
});

describe('ownership', () => {
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
});

// Only tests access control, as behavior is tested in vaultActions.test.ts
describe('Comptroller calls to vault actions', () => {
  it('addPersistentlyTrackedAsset: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.connect(fundOwner).addPersistentlyTrackedAsset(randomAddress())).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('burnShares: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.connect(fundOwner).burnShares(randomAddress(), 1)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('mintShares: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.connect(fundOwner).mintShares(randomAddress(), 1)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('receiveValidatedVaultAction: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(fundOwner).receiveValidatedVaultAction(0, constants.HashZero),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('removeTrackedAsset: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.connect(fundOwner).removeTrackedAsset(randomAddress())).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('transferShares: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(fundOwner).transferShares(randomAddress(), randomAddress(), 1),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('withdrawAssetTo: can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(fundOwner).withdrawAssetTo(randomAddress(), randomAddress(), 1),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });
});
