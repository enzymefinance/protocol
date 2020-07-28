import { BuidlerProvider, Contract } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { ERC20WithFields } from '../contracts/ERC20WithFields';
import { Hub } from '../contracts/Hub';
import { Registry } from '../contracts/Registry';
import { Shares } from '../contracts/Shares';

async function preSharesDeploySnapshot(provider: BuidlerProvider) {
  const [deployer] = await provider.listAccounts();
  const signer = provider.getSigner(deployer);
  const mockAsset1 = await ERC20WithFields.mock(signer);
  const mockAsset2 = await ERC20WithFields.mock(signer);
  const mockHub = await Hub.mock(signer);
  const mockRegistry = await Registry.mock(signer);
  const tokenName = 'My Fund';

  // Set mock config

  await mockHub.REGISTRY.returns(mockRegistry);

  for (const asset of [mockAsset1, mockAsset2]) {
    await mockRegistry.primitiveIsRegistered.given(asset).returns(false);

    await mockRegistry.derivativeToPriceSource
      .given(asset)
      .returns(ethers.constants.AddressZero);

    await asset.decimals.returns(18);
  }

  return {
    deployer,
    denominationAsset: mockAsset1,
    mockAsset2,
    mockHub,
    mockRegistry,
    signer,
    tokenName,
  };
}

async function sharesDeployedSnapshot(provider: BuidlerProvider) {
  const prevSnapshot = await preSharesDeploySnapshot(provider);

  await prevSnapshot.mockRegistry.primitiveIsRegistered
    .given(prevSnapshot.denominationAsset)
    .returns(true);

  const shares = await Shares.deploy(
    prevSnapshot.signer,
    prevSnapshot.mockHub,
    prevSnapshot.denominationAsset,
    prevSnapshot.tokenName,
  );

  return {
    ...prevSnapshot,
    shares,
  };
}

let tx, res;

describe('Shares', () => {
  describe('constructor', () => {
    fit('cannot set a non-primitive asset as denomination asset', async () => {
      const {
        denominationAsset,
        mockHub,
        mockRegistry,
        signer,
        tokenName,
      } = await provider.snapshot(preSharesDeploySnapshot);

      // Should fail, due to the denomination asset not being registered
      tx = Shares.deploy(signer, mockHub, denominationAsset, tokenName);
      await expect(tx).rejects.toBeRevertedWith(
        'Denomination asset must be registered',
      );

      // Register denomination asset, and it should succeed
      await mockRegistry.primitiveIsRegistered
        .given(denominationAsset)
        .returns(true);
      tx = Shares.deploy(signer, mockHub, denominationAsset, tokenName);
      await expect(tx).resolves.toBeInstanceOf(Shares);
    });

    it('sets initial storage values', async () => {
      const {
        shares,
        denominationAsset,
        mockHub,
        tokenName,
      } = await provider.snapshot(sharesDeployedSnapshot);

      tx = shares.HUB();
      await expect(tx).resolves.toBe(mockHub.address);

      tx = shares.DENOMINATION_ASSET();
      await expect(tx).resolves.toBe(denominationAsset.address);

      tx = shares.name();
      await expect(tx).resolves.toBe(tokenName);

      tx = shares.symbol();
      await expect(tx).resolves.toBe('MLNF');

      tx = shares.decimals();
      await expect(tx).resolves.toBe(await denominationAsset.decimals());
    });
  });

  describe('buyShares', () => {
    it.todo('can only be called by SharesRequestor');

    it.todo('reverts if _minSharesQuantity is not met');

    it.todo('deducts owed fees');

    it.todo('updates state and emits SharesBought');
  });

  describe('__redeemShares', () => {
    it.todo('reverts if a user does not have enough shares');

    it.todo('reverts if the fund has no assets');

    it.todo('reverts with a bad asset transfer function');

    it.todo('deducts owed fees');

    it.todo('updates state and emits SharesBought');
  });
});
