import { randomAddress, EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';
import { constants } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

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

describe('init', () => {
  it('can not be called directly (delegatecalled only)', async () => {
    const {
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.init(randomAddress(), randomAddress(), 'Melon Fund')).rejects.toBeRevertedWith(
      'Only delegate callable',
    );
  });
});
