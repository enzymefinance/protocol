import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { makeOrderSignatureBytes } from '~/utils/constants/orderSignatures';

describe('assetWhitelist', () => {
  let environment, user, defaultTxOpts;
  let assetArray;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    assetArray = [
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
    ];
  });

  it('Create whitelist', async () => {
    const whitelist = await deploy(environment, Contracts.AssetWhitelist, [
      assetArray,
    ]);

    expect(await whitelist.methods.getMembers().call()).toEqual(
      assetArray,
    );
  });

  it('Remove asset from whitelist', async () => {
    const whitelist = await deploy(environment, Contracts.AssetWhitelist, [
      assetArray,
    ]);
    const mockAsset = `${randomAddress()}`;

    expect(await whitelist.methods.getMembers().call()).toEqual(
      assetArray,
    );
    await expect(
      whitelist.methods
        .removeFromWhitelist(mockAsset)
        .send(defaultTxOpts),
    ).rejects.toThrow('Asset not in whitelist');
    expect(await whitelist.methods.getMembers().call()).toEqual(
      assetArray,
    );
    await expect(
      whitelist.methods
        .removeFromWhitelist(assetArray[0])
        .send(defaultTxOpts),
    ).resolves.not.toThrow();
    expect(await whitelist.methods.isMember(assetArray[0]).call()).toBe(
      false,
    );
  });

  it('Policy manager with whitelist', async () => {
    const contracts = await deployMockSystem(environment, {
      policyManagerContract: Contracts.PolicyManager,
    });
    const whitelist = await deploy(environment, Contracts.AssetWhitelist, [
      assetArray,
    ]);
    const asset = assetArray[1];
    await contracts.policyManager.methods
      .register(makeOrderSignatureBytes, whitelist.options.address)
      .send(defaultTxOpts);

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
      .send(defaultTxOpts);

    expect(await whitelist.methods.isMember(asset).call()).toBe(false);
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
