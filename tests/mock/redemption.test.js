import { toWei, randomHex } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('redemption', () => {
  let user, defaultTxOpts;
  let mockSystem;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    mockSystem = await deployMockSystem(
      {accountingContract: CONTRACT_NAMES.ACCOUNTING}
    );
  });

  test('Redeem with no shares fails', async () => {
    const preShares = await mockSystem.shares.methods.balanceOf(user).call();

    await mockSystem.shares.methods
      .createFor(randomHex(20), '1000')
      .send(defaultTxOpts);

    expect(preShares).toBe('0');
    await expect(
      mockSystem.shares.methods
        .redeemShares()
        .send(defaultTxOpts),
    ).rejects.toThrow('_sharesQuantity must be > 0');
    await expect(
      mockSystem.shares.methods
        .redeemSharesWithConstraints('1', [])
        .send(defaultTxOpts),
    ).rejects.toThrow('_assets cannot be empty');
  });

  test('Asset with 0 assetBalance prevents redemption', async () => {
    const errorMessage = 'Requested asset holdings is 0';
    const addr = randomHex(20);

    await
      mockSystem.shares.methods.createFor(user, '1000')
      .send(defaultTxOpts);

    const preShares = await mockSystem.shares.methods.balanceOf(user).call();

    await expect(
      mockSystem.shares.methods
        .redeemSharesWithConstraints('1', [addr])
        .send(defaultTxOpts),
    ).rejects.toThrow(errorMessage);

    const postShares = await mockSystem.shares.methods.balanceOf(user).call();

    expect(preShares).toBe(postShares);
  });

  test('Asset cannot be redeemed twice', async () => {
    // const errorMessage = 'Asset can only be redeemed once'; // TODO: add this back in unit test using real fund
    const errorMessage = 'Requested asset holdings is 0';

    const preShares = await mockSystem.shares.methods.balanceOf(user).call();

    await expect(
      mockSystem.shares.methods
        .redeemSharesWithConstraints('1', [
          mockSystem.weth.options.address,
          mockSystem.weth.options.address,
        ])
        .send(defaultTxOpts),
    ).rejects.toThrow(errorMessage);

    const postShares = await mockSystem.shares.methods.balanceOf(user).call();

    expect(preShares).toBe(postShares);
  });
});
