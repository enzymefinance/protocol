import { BN, toWei } from 'web3-utils';

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

    // Define user accounts
    s.user = s.env.wallet.address;
    s.standardGas = 8000000;
    s.defaultTxOpts = { from: s.user, gas: s.standardGas };

    // Setup necessary contracts
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
      .send(s.defaultTxOpts);
  });

  it('Fee Manager is properly initialized', async () => {
    for (const fee of s.feeArray) {
      await expect(
        s.feeManager.methods.feeIsRegistered(fee.feeAddress).call(),
      ).toBeTruthy();
    }
    for (const i in s.feeArray.length) {
      const feeAddress = await s.feeManager.methods.fees(i).call();
      expect(feeAddress).toBe(s.feeArray[i].feeAddress);
    }
  });

  it('Total fee amount aggregates individual accumulated fee', async () => {
    const feeAmount = new BN(toWei('1', 'ether'));
    await s.feeA.methods
      .setFeeAmount(`${feeAmount}`)
      .send(s.defaultTxOpts);
    await s.feeB.methods
      .setFeeAmount(`${feeAmount}`)
      .send(s.defaultTxOpts);
    await expect(
      s.feeManager.methods.totalFeeAmount().call(),
    ).resolves.toEqual(feeAmount.mul(new BN(2)).toString());
  });

  it('Reward all fee allocates shares to the manager', async () => {
    const preManagerShares = new BN(
      await s.shares.methods.balanceOf(s.user).call(),
    );
    const feeAmount = new BN(toWei('1', 'ether'));

    await s.feeA.methods
      .setFeeAmount(`${feeAmount}`)
      .send(s.defaultTxOpts);
    await s.feeB.methods
      .setFeeAmount(`${feeAmount}`)
      .send(s.defaultTxOpts);
    await s.feeManager.methods
      .rewardAllFees() // can only call becasue of loose mockhub permissions
      .send(s.defaultTxOpts);
    const postManagerShares = new BN(
      await s.shares.methods.balanceOf(s.user).call(),
    );
    const postAccumulatedFee = await s.feeManager.methods
      .totalFeeAmount()
      .call();

    expect(postManagerShares).toEqual(
      preManagerShares.add(feeAmount.mul(new BN(2)))
    );
    expect(postAccumulatedFee).toBe('0');
  });
});
