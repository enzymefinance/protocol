import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { add, multiply, BigInteger } from '@melonproject/token-math';

describe('feeManager', () => {
  let shared: any = {};

  const mockFeeRate = 5000;
  const mockFeePeriod = 1000;

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.user = shared.env.wallet.address;
  });

  beforeEach(async () => {
    shared.feeA = getContract(
      shared.env,
      Contracts.MockFee,
      await deployContract(shared.env, Contracts.MockFee, ['0']),
    );
    shared.feeB = getContract(
      shared.env,
      Contracts.MockFee,
      await deployContract(shared.env, Contracts.MockFee, ['1']),
    );
    shared.feeArray = [
      {
        feeAddress: shared.feeA.options.address,
        feePeriod: mockFeePeriod,
        feeRate: mockFeeRate,
      },
      {
        feeAddress: shared.feeB.options.address,
        feePeriod: mockFeePeriod,
        feeRate: mockFeeRate,
      },
    ];

    const deployment = await deployMockSystem(shared.env, {
      feeManagerContract: Contracts.FeeManager,
      fees: shared.feeArray,
    });
    shared = Object.assign(shared, deployment);

    await shared.registry.methods // just to pass pay amgu
      .setIsFund(shared.feeManager.options.address)
      .send({ from: shared.user });
  });

  it('Fee Manager is properly initialized', async () => {
    for (const fee of shared.feeArray) {
      await expect(
        shared.feeManager.methods.feeIsRegistered(fee.feeAddress).call(),
      ).toBeTruthy();
    }
    for (const i of Array.from(Array(shared.feeArray.length).keys())) {
      const feeAddress = await shared.feeManager.methods.fees(i).call();
      expect(feeAddress).toBe(shared.feeArray[i].feeAddress);
    }
  });

  it('Total fee amount aggregates individual accumulated fee', async () => {
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

  it('Reward all fee allocates shares to the manager', async () => {
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
      .rewardAllFees() // can only call becasue of loose mockhub permissions
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
});
