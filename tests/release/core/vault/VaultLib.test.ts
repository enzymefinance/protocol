import { constants } from 'ethers';

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const vaultLib = fork.deployment.vaultLib;

    const accessorValue = await vaultLib.getAccessor();
    expect(accessorValue).toMatchAddress(constants.AddressZero);

    const creatorValue = await vaultLib.getCreator();
    expect(creatorValue).toMatchAddress(constants.AddressZero);

    const migratorValue = await vaultLib.getMigrator();
    expect(migratorValue).toMatchAddress(constants.AddressZero);

    const ownerValue = await vaultLib.getOwner();
    expect(ownerValue).toMatchAddress(constants.AddressZero);

    const trackedAssetsValue = await vaultLib.getTrackedAssets();
    expect(trackedAssetsValue).toEqual([]);

    // SharesToken values

    const nameValue = await vaultLib.name();
    expect(nameValue).toBe('');

    await expect(vaultLib.symbol()).rejects.toBeReverted();

    const decimalsValue = await vaultLib.decimals();
    expect(decimalsValue).toBe(18);
  });
});
