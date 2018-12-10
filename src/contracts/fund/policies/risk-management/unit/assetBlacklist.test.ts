import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import * as Web3Utils from 'web3-utils';

describe('assetBlacklist', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.user = shared.env.wallet.address;
    shared.opts = { from: shared.user, gas: 8000000 };
    shared.testBlacklist = Web3Utils.sha3('func()').substring(0, 10);
    shared.assetArray = [
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
    ];
  });

  it('Create blacklist', async () => {
    const blacklist = await deploy(shared.env, Contracts.AssetBlacklist, [
      shared.assetArray,
    ]);

    expect(await blacklist.methods.getMembers().call()).toEqual(
      shared.assetArray,
    );
  });

  it('Add asset to blacklist', async () => {
    const blacklist = await deploy(shared.env, Contracts.AssetBlacklist, [
      shared.assetArray,
    ]);
    const mockAsset = `${randomAddress()}`;

    expect(await blacklist.methods.getMembers().call()).toEqual(
      shared.assetArray,
    );
    await expect(
      blacklist.methods
        .addToBlacklist(shared.assetArray[0])
        .send({ from: shared.user }),
    ).rejects.toThrow('Asset already in blacklist');
    expect(await blacklist.methods.getMembers().call()).toEqual(
      shared.assetArray,
    );
    await expect(
      blacklist.methods.addToBlacklist(mockAsset).send({ from: shared.user }),
    ).resolves.not.toThrow();
    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);
  });

  it('Policy manager with blacklist', async () => {
    const contracts = await deployMockSystem(shared.env, {
      policyManagerContract: Contracts.PolicyManager,
    });
    const blacklist = await deploy(shared.env, Contracts.AssetBlacklist, [
      shared.assetArray,
    ]);
    const mockAsset = `${randomAddress()}`;
    await contracts.policyManager.methods
      .register(shared.testBlacklist, blacklist.options.address)
      .send({ from: shared.user });

    const validateArgs = [
      shared.testBlacklist,
      [emptyAddress, emptyAddress, emptyAddress, mockAsset, emptyAddress],
      [0, 0, 0],
      '0x0',
    ];
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).resolves.not.toThrow();

    await blacklist.methods
      .addToBlacklist(mockAsset)
      .send({ from: shared.user });

    expect(await blacklist.methods.isMember(mockAsset).call()).toBe(true);
    await expect(
      contracts.policyManager.methods.preValidate(...validateArgs).call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
