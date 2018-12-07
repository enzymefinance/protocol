import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import * as Web3Utils from 'web3-utils';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem(shared.env));
  shared.user = shared.env.wallet.address;
  shared.opts = { from: shared.user, gas: 8000000 };
  shared.testFunction = Web3Utils.sha3('func()').substring(0, 10);
});

test('Create and get max', async () => {
  const positions = ['0', '125', '9999999999'];
  for (const n of positions) {
    const maxPositions = await deploy(shared.env, Contracts.MaxPositions, [n]);
    expect(await maxPositions.methods.maxPositions().call()).toEqual(n);
  }
});

test('Policy manager and mock accounting with maxPositions', async () => {
  const maxPositions = '3';
  const policy = await deploy(shared.env, Contracts.MaxPositions, [
    maxPositions,
  ]);
  const nonQuoteAsset = `${randomAddress()}`;
  const quoteAsset = shared.weth.options.address;
  await shared.policyManager.methods
    .register(shared.testFunction, policy.options.address)
    .send({ from: shared.user, gas: 8000000 });
  await shared.accounting.methods
    .setOwnedAssets([shared.weth.options.address])
    .send({ from: shared.user, gas: 8000000 });

  await expect(
    shared.policyManager.methods
      .postValidate(
        shared.testFunction,
        [emptyAddress, emptyAddress, emptyAddress, quoteAsset, emptyAddress],
        [0, 0, 0],
        '0x0',
      )
      .call(),
  ).resolves.not.toThrow();
  await expect(
    shared.policyManager.methods
      .postValidate(
        shared.testFunction,
        [emptyAddress, emptyAddress, emptyAddress, nonQuoteAsset, emptyAddress],
        [0, 0, 0],
        '0x0',
      )
      .call(),
  ).resolves.not.toThrow();

  await shared.accounting.methods
    .setOwnedAssets([nonQuoteAsset, `${randomAddress()}`, `${randomAddress()}`])
    .send({ from: shared.user, gas: 8000000 });

  await expect(
    shared.policyManager.methods
      .postValidate(
        shared.testFunction,
        [emptyAddress, emptyAddress, emptyAddress, quoteAsset, emptyAddress],
        [0, 0, 0],
        '0x0',
      )
      .call(),
  ).resolves.not.toThrow();
  await expect(
    shared.policyManager.methods
      .postValidate(
        shared.testFunction,
        [emptyAddress, emptyAddress, emptyAddress, nonQuoteAsset, emptyAddress],
        [0, 0, 0],
        '0x0',
      )
      .call(),
  ).resolves.not.toThrow();

  await shared.accounting.methods
    .setOwnedAssets([
      nonQuoteAsset,
      `${randomAddress()}`,
      `${randomAddress()}`,
      `${randomAddress()}`,
    ])
    .send({ from: shared.user, gas: 8000000 });

  await expect(
    shared.policyManager.methods
      .postValidate(
        shared.testFunction,
        [
          emptyAddress,
          emptyAddress,
          emptyAddress,
          `${randomAddress()}`,
          emptyAddress,
        ],
        [0, 0, 0],
        '0x0',
      )
      .call(),
  ).rejects.toThrow('Rule evaluated to false');
});
