import { BN, toWei } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('feeManager', () => {
  let user, defaultTxOpts;
  let mockSystem;
  let feeA, feeB, feeArray;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    feeA = await deploy(CONTRACT_NAMES.MOCK_FEE, ['0']);
    feeB = await deploy(CONTRACT_NAMES.MOCK_FEE, ['1']);
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

    mockSystem = await deployMockSystem({
      feeManagerContract: CONTRACT_NAMES.FEE_MANAGER,
      fees: feeArray,
    });

    await mockSystem.registry.methods // just to pass pay amgu
      .setIsFund(mockSystem.feeManager.options.address)
      .send(defaultTxOpts);
  });

  test('Fee Manager is properly initialized', async () => {
    for (const fee of feeArray) {
      const feeRegistered = await mockSystem.feeManager.methods.feeIsRegistered(fee.feeAddress).call();
      expect(feeRegistered).toBe(true);
    }
    for (const i in feeArray.length) {
      const feeAddress = await mockSystem.feeManager.methods.fees(i).call();
      expect(feeAddress).toBe(feeArray[i].feeAddress);
    }
  });

  test('Total fee amount aggregates individual accumulated fee', async () => {
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

  test('Reward all fee allocates shares to the manager', async () => {
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
