import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { deploy } from '~/utils/solidity/deploy';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { add, multiply, BigInteger } from '@melonproject/token-math/bigInteger';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
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
  shared = Object.assign(
    shared,
    await deployMockSystem({ feeManagerContract: Contracts.FeeManager }),
  );
  await shared.feeManager.methods
    .batchRegister(shared.feeArray)
    .send({ from: shared.user, gas: 8000000 });
  await shared.version.methods
    .setIsFund(
      // just to pass pay amgu
      shared.feeManager.options.address,
    )
    .send({ from: shared.user });
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

test('Reward all fee allocates shares to the manager', async () => {
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
    .triggerRewardAllFees()
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
