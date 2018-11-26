import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import { randomAddress } from '~/utils/helpers';
import { Contracts } from '~/Contracts';
import { add, multiply, BigInteger } from '@melonproject/token-math/bigInteger';
import { emptyAddress } from '~/utils/constants';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
});

beforeEach(async () => {
  shared.feeA = getContract(
    Contracts.MockFee,
    await deploy(Contracts.MockFee, []),
  );
  shared.feeB = getContract(
    Contracts.MockFee,
    await deploy(Contracts.MockFee, []),
  );
  shared.feeArray = [shared.feeA.options.address, shared.feeB.options.address];
  shared.feeManager = getContract(
    Contracts.FeeManager,
    await deploy(Contracts.FeeManager, [shared.hub.options.address]),
  );
  await shared.feeManager.methods
    .batchRegister(shared.feeArray)
    .send({ from: shared.user, gas: 8000000 });
});

test('Fee Manager is properly initialized', async () => {
  for (const feeAddress of shared.feeArray) {
    await expect(
      shared.feeManager.methods.feeIsRegistered(feeAddress).call(),
    ).toBeTruthy();
  }
  for (const i of Array.from(Array(shared.feeArray.length).keys())) {
    const feeAddress = await shared.feeManager.methods.fees(i).call();
    expect(feeAddress).toBe(shared.feeArray[i]);
  }
});

test('Total fee amount aggregates individual accumulated fee', async () => {
  const feeAmount = new BigInteger(10 ** 18);
  await shared.feeA.methods
    .setFeeAmount(`${feeAmount}`)
    .send({ from: shared.user, gas: 8000000 });
  await shared.feeB.methods
    .setFeeAmount(`${feeAmount}`)
    .send({ from: shared.user, gas: 8000000 });
  await expect(
    shared.feeManager.methods.totalFeeAmount().call(),
  ).resolves.toEqual(multiply(feeAmount, new BigInteger(2)));
});

test('Cannot call rewardFee for unregistered fee', async () => {
  const feeCAddress = await deploy(Contracts.MockFee, []);
  await expect(
    shared.feeManager.methods.rewardFee(feeCAddress).call(),
  ).rejects.toThrow();
});

test('Reward all fee allocates shares to the manager', async () => {
  // Add shares contract as a route
  await shared.feeManager.methods
    .initialize([
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      shared.shares.options.address,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
    ])
    .send({ from: shared.user, gas: 8000000 });

  const preManagerShares = new BigInteger(
    await shared.shares.methods.balanceOf(shared.user).call(),
  );
  const feeAmount = new BigInteger(10 ** 18);

  await shared.feeA.methods
    .setFeeAmount(`${feeAmount}`)
    .send({ from: shared.user, gas: 8000000 });
  await shared.feeB.methods
    .setFeeAmount(`${feeAmount}`)
    .send({ from: shared.user, gas: 8000000 });
  await shared.feeManager.methods
    .rewardAllFees()
    .send({ from: shared.user, gas: 8000000 });

  const postManagerShares = new BigInteger(
    await shared.shares.methods.balanceOf(shared.user).call(),
  );
  const postAccumulatedFee = await shared.feeManager.methods
    .totalFeeAmount()
    .call();

  expect(postManagerShares).toEqual(
    add(preManagerShares, multiply(feeAmount, new BigInteger(2))),
  );
  expect(postAccumulatedFee).toBe('0');
});
