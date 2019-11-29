import { BN, toWei } from 'web3-utils';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { CONTRACT_NAMES } from '~/tests/utils/new/constants';

describe('feeManager', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;
  let feeA, feeB, feeArray;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    feeA = getContract(
      environment,
      CONTRACT_NAMES.MOCK_FEE,
      await deployContract(environment, CONTRACT_NAMES.MOCK_FEE, ['0']),
    );
    feeB = getContract(
      environment,
      CONTRACT_NAMES.MOCK_FEE,
      await deployContract(environment, CONTRACT_NAMES.MOCK_FEE, ['1']),
    );
    const mockFeeRate = 5000;
    const mockFeePeriod = 1000;
    feeArray = [
      {
        feeAddress: feeA.options.address,
        feePeriod: mockFeePeriod,
        feeRate: mockFeeRate,
      },
      {
        feeAddress: feeB.options.address,
        feePeriod: mockFeePeriod,
        feeRate: mockFeeRate,
      },
    ];

    mockSystem = await deployMockSystem(environment, {
      feeManagerContract: CONTRACT_NAMES.FEE_MANAGER,
      fees: feeArray,
    });

    await mockSystem.registry.methods // just to pass pay amgu
      .setIsFund(mockSystem.feeManager.options.address)
      .send(defaultTxOpts);
  });

  it('Fee Manager is properly initialized', async () => {
    for (const fee of feeArray) {
      await expect(
        mockSystem.feeManager.methods.feeIsRegistered(fee.feeAddress).call(),
      ).toBeTruthy();
    }
    for (const i in feeArray.length) {
      const feeAddress = await mockSystem.feeManager.methods.fees(i).call();
      expect(feeAddress).toBe(feeArray[i].feeAddress);
    }
  });

  it('Total fee amount aggregates individual accumulated fee', async () => {
    const feeAmount = new BN(toWei('1', 'ether'));
    await feeA.methods
      .setFeeAmount(`${feeAmount}`)
      .send(defaultTxOpts);
    await feeB.methods
      .setFeeAmount(`${feeAmount}`)
      .send(defaultTxOpts);
    await expect(
      mockSystem.feeManager.methods.totalFeeAmount().call(),
    ).resolves.toEqual(feeAmount.mul(new BN(2)).toString());
  });

  it('Reward all fee allocates shares to the manager', async () => {
    const preManagerShares = new BN(
      await mockSystem.shares.methods.balanceOf(user).call(),
    );
    const feeAmount = new BN(toWei('1', 'ether'));

    await feeA.methods
      .setFeeAmount(`${feeAmount}`)
      .send(defaultTxOpts);
    await feeB.methods
      .setFeeAmount(`${feeAmount}`)
      .send(defaultTxOpts);
    await mockSystem.feeManager.methods
      .rewardAllFees() // can only call becasue of loose mockhub permissions
      .send(defaultTxOpts);
    const postManagerShares = new BN(
      await mockSystem.shares.methods.balanceOf(user).call(),
    );
    const postAccumulatedFee = await mockSystem.feeManager.methods
      .totalFeeAmount()
      .call();

    expect(postManagerShares).toEqual(
      preManagerShares.add(feeAmount.mul(new BN(2)))
    );
    expect(postAccumulatedFee).toBe('0');
  });
});
