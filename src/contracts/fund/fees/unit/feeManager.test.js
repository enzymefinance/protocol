import { BigNumber } from 'bignumber.js';

import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';

describe('feeManager', () => {
  let s = {};

  const mockFeeRate = 5000;
  const mockFeePeriod = 1000;

  beforeAll(async () => {
    s.env = await initTestEnvironment();
    s.user = s.env.wallet.address;
  });

  beforeEach(async () => {
    s.feeA = getContract(
      s.env,
      Contracts.MockFee,
      await deployContract(s.env, Contracts.MockFee, ['0']),
    );
    s.feeB = getContract(
      s.env,
      Contracts.MockFee,
      await deployContract(s.env, Contracts.MockFee, ['1']),
    );
    s.feeArray = [
      {
        feeAddress: s.feeA.options.address,
        feePeriod: mockFeePeriod,
        feeRate: mockFeeRate,
      },
      {
        feeAddress: s.feeB.options.address,
        feePeriod: mockFeePeriod,
        feeRate: mockFeeRate,
      },
    ];

    s = {
      ...s,
      ...(await deployMockSystem(s.env, {
        feeManagerContract: Contracts.FeeManager,
        fees: s.feeArray,
      }))
    };

    await s.registry.methods // just to pass pay amgu
      .setIsFund(s.feeManager.options.address)
      .send({ from: s.user });
  });

  it('Fee Manager is properly initialized', async () => {
    for (const fee of s.feeArray) {
      await expect(
        s.feeManager.methods.feeIsRegistered(fee.feeAddress).call(),
      ).toBeTruthy();
    }
    for (const i of Array.from(Array(s.feeArray.length).keys())) {
      const feeAddress = await s.feeManager.methods.fees(i).call();
      expect(feeAddress).toBe(s.feeArray[i].feeAddress);
    }
  });

  it('Total fee amount aggregates individual accumulated fee', async () => {
    const feeAmount = new BigNumber('1e+18');
    await s.feeA.methods
      .setFeeAmount(`${feeAmount}`)
      .send({ from: s.user, gas: 8000000 });
    await s.feeB.methods
      .setFeeAmount(`${feeAmount}`)
      .send({ from: s.user, gas: 8000000 });
    await expect(
      s.feeManager.methods.totalFeeAmount().call(),
    ).resolves.toEqual(feeAmount.times(2).toString());
  });

  it('Reward all fee allocates shares to the manager', async () => {
    const preManagerShares = new BigNumber(
      await s.shares.methods.balanceOf(s.user).call(),
    );
    const feeAmount = new BigNumber('1e+18');

    await s.feeA.methods
      .setFeeAmount(`${feeAmount}`)
      .send({ from: s.user, gas: 8000000 });
    await s.feeB.methods
      .setFeeAmount(`${feeAmount}`)
      .send({ from: s.user, gas: 8000000 });
    await s.feeManager.methods
      .rewardAllFees() // can only call becasue of loose mockhub permissions
      .send({ from: s.user, gas: 8000000 });
    const postManagerShares = new BigNumber(
      await s.shares.methods.balanceOf(s.user).call(),
    );
    const postAccumulatedFee = await s.feeManager.methods
      .totalFeeAmount()
      .call();

    expect(postManagerShares).toEqual(
      preManagerShares.plus(feeAmount.times(2)),
    );
    expect(postAccumulatedFee).toBe('0');
  });
});
