import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { Contracts } from '~/Contracts';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(
    shared,
    await deployMockSystem({
      accountingContract: Contracts.Accounting,
    }),
  );
  shared.user = shared.env.wallet.address;
});

test('Redeem with no shares fails', async () => {
  const errorMessage = 'Sender does not have enough shares to fulfill request';
  const preShares = await shared.shares.methods.balanceOf(shared.user).call();

  await shared.shares.methods
    .createFor(`${randomAddress()}`, '1000')
    .send({ from: shared.user });

  expect(preShares).toBe('0');
  await expect(
    shared.participation.methods
      .redeem()
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);
  await expect(
    shared.participation.methods
      .redeemWithConstraints('1', [])
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);
});

test('Asset not in list prevents redemption', async () => {
  const errorMessage = 'Requested asset not in asset list';
  const addr = `${randomAddress()}`;

  await shared.shares.methods
    .createFor(`${shared.user}`, '1000')
    .send({ from: shared.user });

  const preShares = await shared.shares.methods.balanceOf(shared.user).call();

  await expect(
    shared.participation.methods
      .redeemWithConstraints('1', [addr])
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  const postShares = await shared.shares.methods.balanceOf(shared.user).call();

  expect(preShares).toBe(postShares);
});

test('Asset cannot be redeemed twice', async () => {
  const errorMessage = 'Asset can only be redeemed once';

  const preShares = await shared.shares.methods.balanceOf(shared.user).call();

  await expect(
    shared.participation.methods
      .redeemWithConstraints('1', [
        shared.weth.options.address,
        shared.weth.options.address,
      ])
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  const postShares = await shared.shares.methods.balanceOf(shared.user).call();

  expect(preShares).toBe(postShares);
});

test('Vault-held assets can be redeemed', async () => {
  const wethAmount = '1000';
  await shared.weth.methods
    .transfer(shared.vault.options.address, wethAmount)
    .send({ from: shared.user });
  const heldWeth = await shared.accounting.methods
    .assetHoldings(shared.weth.options.address)
    .call();
  const preShares = await shared.shares.methods.balanceOf(shared.user).call();

  expect(heldWeth).toBe(wethAmount);

  await shared.participation.methods
    .redeemWithConstraints(preShares, [shared.weth.options.address])
    .send({ from: shared.user, gas: 8000000 });

  const postShares = await shared.shares.methods.balanceOf(shared.user).call();

  expect(postShares).toBe('0');
}, 100000);
