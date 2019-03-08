import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { makeOrderSignatureBytes } from '~/utils/constants/orderSignatures';

describe('assetWhitelist', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.user = shared.env.wallet.address;
    shared.opts = { from: shared.user, gas: 8000000 };
    shared.assetArray = [
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
    ];
  });

  it('Create whitelist', async () => {
    const whitelist = await deploy(shared.env, Contracts.AssetWhitelist, [
      shared.assetArray,
    ]);

    expect(await whitelist.methods.getMembers().call()).toEqual(
      shared.assetArray,
    );
  });

  it('Remove asset from whitelist', async () => {
    const whitelist = await deploy(shared.env, Contracts.AssetWhitelist, [
      shared.assetArray,
    ]);
    const mockAsset = `${randomAddress()}`;

    expect(await whitelist.methods.getMembers().call()).toEqual(
      shared.assetArray,
    );
    await expect(
      whitelist.methods
        .removeFromWhitelist(mockAsset)
        .send({ from: shared.user }),
    ).rejects.toThrow('Asset not in whitelist');
    expect(await whitelist.methods.getMembers().call()).toEqual(
      shared.assetArray,
    );
    await expect(
      whitelist.methods
        .removeFromWhitelist(shared.assetArray[0])
        .send({ from: shared.user }),
    ).resolves.not.toThrow();
    expect(await whitelist.methods.isMember(shared.assetArray[0]).call()).toBe(
      false,
    );
  });

  it('Policy manager with whitelist', async () => {
    const contracts = await deployMockSystem(shared.env, {
      policyManagerContract: Contracts.PolicyManager,
    });
    const whitelist = await deploy(shared.env, Contracts.AssetWhitelist, [
      shared.assetArray,
    ]);
    const asset = shared.assetArray[1];
    await contracts.policyManager.methods
      .register(makeOrderSignatureBytes, whitelist.options.address)
      .send({ from: shared.user });

    const validateArgs = [
      makeOrderSignatureBytes,
      [emptyAddress, emptyAddress, emptyAddress, asset, emptyAddress],
      [0, 0, 0],
      '0x0',
    ];
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).resolves.not.toThrow();

    await whitelist.methods
      .removeFromWhitelist(asset)
      .send({ from: shared.user });

    expect(await whitelist.methods.isMember(asset).call()).toBe(false);
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
