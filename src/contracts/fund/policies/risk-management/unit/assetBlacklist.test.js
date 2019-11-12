import { Contracts } from '~/Contracts';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { makeOrderSignatureBytes } from '~/utils/constants/orderSignatures';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';

describe('assetBlacklist', () => {
  let s = {};

  beforeAll(async () => {
    // Setup environment
    s.env = await initTestEnvironment();

    // Define user accounts
    s.user = s.env.wallet.address;
    s.standardGas = 8000000;
    s.defaultTxOpts = { from: s.user, gas: s.standardGas };

    // Setup contracts
    s = {
      ...s,
      ...(await deployMockSystem(s.env, {
      policyManagerContract: Contracts.PolicyManager,
      }))
    };

    // Define shared vars
    s.assetArray = [
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
    ];
  });

  it('Create blacklist', async () => {
    const blacklist = await deploy(
      s.env,
      Contracts.AssetBlacklist,
      [s.assetArray]
    );

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(s.assetArray);
  });

  it('Add asset to blacklist', async () => {
    const blacklist = await deploy(
      s.env,
      Contracts.AssetBlacklist,
      [s.assetArray]
    );
    const mockAsset = `${randomAddress()}`;

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(s.assetArray);

    await expect(
      blacklist.methods.addToBlacklist(s.assetArray[0]).send(s.defaultTxOpts)
    ).rejects.toThrow('Asset already in blacklist');

    expect(
      await blacklist.methods.getMembers().call()
    ).toEqual(s.assetArray);

    await expect(
      blacklist.methods.addToBlacklist(mockAsset).send(s.defaultTxOpts)
    ).resolves.not.toThrow();

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);
  });

  it('Policy manager with blacklist', async () => {
    const blacklist = await deploy(
      s.env,
      Contracts.AssetBlacklist,
      [s.assetArray]
    );
    const mockAsset = `${randomAddress()}`;

    await s.policyManager.methods
      .register(makeOrderSignatureBytes, blacklist.options.address)
      .send(s.defaultTxOpts);

    const validateArgs = [
      makeOrderSignatureBytes,
      [emptyAddress, emptyAddress, emptyAddress, mockAsset, emptyAddress],
      [0, 0, 0],
      '0x0',
    ];
    await expect(
      s.policyManager.methods.preValidate(...validateArgs).call()
    ).resolves.not.toThrow();

    await blacklist.methods.addToBlacklist(mockAsset).send(s.defaultTxOpts);

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);

    await expect(
      s.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
