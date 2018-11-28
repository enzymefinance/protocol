import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import * as Web3Utils from 'web3-utils';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.user = shared.env.wallet.address;
  shared.opts = { from: shared.user, gas: 8000000 };
  shared.testWhitelist = Web3Utils.sha3('func()').substring(0, 10);
  shared.assetArray = [
    `${randomAddress()}`,
    `${randomAddress()}`,
    `${randomAddress()}`,
    `${randomAddress()}`,
    `${randomAddress()}`,
  ];
});

test('Create whitelist', async () => {
  const whitelist = await deploy(Contracts.AssetWhitelist, [shared.assetArray]);

  expect(await whitelist.methods.getMembers().call()).toEqual(
    shared.assetArray,
  );
});

test('Remove asset from whitelist', async () => {
  const whitelist = await deploy(Contracts.AssetWhitelist, [shared.assetArray]);
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

test('Policy manager with whitelist', async () => {
  const whitelist = await deploy(Contracts.AssetWhitelist, [shared.assetArray]);
  const manager = await deploy(Contracts.PolicyManager, [emptyAddress]);
  const asset = shared.assetArray[1];
  await manager.methods
    .register(shared.testWhitelist, whitelist.options.address)
    .send({ from: shared.user });

  const validateArgs = [
    shared.testWhitelist,
    [emptyAddress, emptyAddress, emptyAddress, asset, emptyAddress],
    [0, 0, 0],
    '0x0',
  ];
  await expect(
    manager.methods.preValidate(...validateArgs).call(),
  ).resolves.not.toThrow();

  await whitelist.methods
    .removeFromWhitelist(asset)
    .send({ from: shared.user });

  expect(await whitelist.methods.isMember(asset).call()).toBe(false);
  await expect(
    manager.methods.preValidate(...validateArgs).call(),
  ).rejects.toThrow('Rule evaluated to false');
});
