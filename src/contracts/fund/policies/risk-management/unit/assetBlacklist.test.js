import { Contracts } from '~/Contracts';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { makeOrderSignatureBytes } from '~/utils/constants/orderSignatures';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';

describe('assetBlacklist', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;
  let assetArray;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    mockSystem = await deployMockSystem(
      environment,
      { policyManagerContract: Contracts.PolicyManager }
    );

    // Define shared vars
    assetArray = [
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
    ];
  });

  it('Create blacklist', async () => {
    const blacklist = await deploy(
      environment,
      Contracts.AssetBlacklist,
      [assetArray]
    );

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);
  });

  it('Add asset to blacklist', async () => {
    const blacklist = await deploy(
      environment,
      Contracts.AssetBlacklist,
      [assetArray]
    );
    const mockAsset = `${randomAddress()}`;

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);

    await expect(
      blacklist.methods.addToBlacklist(assetArray[0]).send(defaultTxOpts)
    ).rejects.toThrow('Asset already in blacklist');

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(assetArray);

    await expect(
      blacklist.methods.addToBlacklist(mockAsset).send(defaultTxOpts)
    ).resolves.not.toThrow();

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);
  });

  it('Policy manager with blacklist', async () => {
    const blacklist = await deploy(
      environment,
      Contracts.AssetBlacklist,
      [assetArray]
    );
    const mockAsset = `${randomAddress()}`;

    await mockSystem.policyManager.methods
      .register(makeOrderSignatureBytes, blacklist.options.address)
      .send(defaultTxOpts);

    const validateArgs = [
      makeOrderSignatureBytes,
      [emptyAddress, emptyAddress, emptyAddress, mockAsset, emptyAddress],
      [0, 0, 0],
      '0x0',
    ];
    await expect(
      mockSystem.policyManager.methods.preValidate(...validateArgs).call()
    ).resolves.not.toThrow();

    await blacklist.methods.addToBlacklist(mockAsset).send(defaultTxOpts);

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);

    await expect(
      mockSystem.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
