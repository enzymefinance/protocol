import { deployAndGetContract as deploy } from '~/utils/solidity';
import { deployMockSystem } from '~/utils';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { randomAddress } from '~/utils/helpers';
import { emptyAddress } from '~/utils/constants';
import * as Web3Utils from 'web3-utils';

const mockOne = '0x1111111111111111111111111111111111111111';
const mockTwo = '0x2222222222222222222222222222222222222222';
const mockThree = '0x3333333333333333333333333333333333333333';
const mockFour = '0x4444444444444444444444444444444444444444';

const EMPTY = '0x0000000000000000000000000000000000000000';

const assetArray = [mockOne, mockTwo, mockThree];

const DUMMY_ADDR = [EMPTY, EMPTY, mockOne, mockFour];
const DUMMY_VALS = [0, 0, 0];

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  await shared.version.methods
    .setIsFund(shared.participation.options.address)
    .send({ from: shared.user });
  shared.opts = { from: shared.user, gas: 8000000 };
});

let testBlacklist = Web3Utils.sha3(
  'testBlacklist(address[5],uint256[3])',
).substring(0, 10);

test('Create blacklist', async () => {
  const blacklist = await deploy(Contracts.AssetBlacklist, [assetArray]);

  expect(await blacklist.methods.getMembers().call()).toEqual(assetArray);
});

test('Add asset to blacklist', async () => {
  const blacklist = await deploy(Contracts.AssetBlacklist, [assetArray]);

  expect(await blacklist.methods.getMembers().call()).toEqual(assetArray);
  await expect(
    blacklist.methods.addToBlacklist(mockTwo).send({ from: shared.user }),
  ).rejects.toThrow('Asset already in blacklist');
  expect(await blacklist.methods.getMembers().call()).toEqual(assetArray);
  await expect(
    blacklist.methods.addToBlacklist(mockFour).send({ from: shared.user }),
  ).resolves.not.toThrow();
  expect(await blacklist.methods.isMember(mockFour).call()).toBe(true);
});

// TODO: re-enable
//test('Trading against blacklist', async () => {
//  //deploy blacklist policy contract
//  const blacklist = await deploy(Contracts.AssetBlacklist, [assetArray]);

//  let mockFund = await deployContract('policies/mocks/MockFund', opts);
//  await mockFund.methods.register(testBlacklist, blacklist.options.address).send();

//  //mockFour is the token being aquired by the portfolio in the trade (taker asset, position 4)
//  //mockFour is not registerd in the blacklist, therefore we expect the following to not throw
//  await t.notThrows(mockFund.methods.testBlacklist(DUMMY_ADDR, DUMMY_VALS).send())

//  //adding banned asset
//  await t.notThrows( blacklist.methods.addToBlacklist(mockFour).send());

//  //checking if it is there
//  t.true(await blacklist.methods.isMember(mockFour).call());

//  //Now try to trade acquiring mockFour, which was just banned
//  //mockFour IS  registerd in the blacklist, therefore we expect the following to throw
//  await t.throws(mockFund.methods.testBlacklist(DUMMY_ADDR, DUMMY_VALS).send())
//});
