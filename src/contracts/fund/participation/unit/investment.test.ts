import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
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
  await shared.version.methods
    .setIsFund(shared.participation.options.address)
    .send({ from: shared.user });
});

test('Invest fails in shut down fund', async () => {
  const errorMessage = 'Cannot invest in shut down fund';
  const amount = '1000000000000000000';
  await shared.hub.methods.setShutDownState(true).send({ from: shared.user });

  await expect(
    shared.participation.methods
      .invest(amount, amount, shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.hub.methods.setShutDownState(false).send({ from: shared.user });
});

test('Need fresh price to execute request', async () => {
  const errorMessage = 'Price not recent';
  const amount = '1000000000000000000';
  await shared.priceSource.methods
    .setIsRecent(false)
    .send({ from: shared.user });

  await expect(
    shared.participation.methods
      .invest(amount, amount, shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.priceSource.methods
    .setIsRecent(true)
    .send({ from: shared.user });
});

test('Asset must be permitted', async () => {
  const errorMessage = 'Investment not allowed in this asset';
  const asset = `${randomAddress()}`;
  const allowed = await shared.participation.methods
    .investAllowed(asset)
    .call();

  expect(allowed).toBe(false);
  await expect(
    shared.participation.methods
      .invest('100', '100', asset)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.participation.methods
    .enableInvestment([asset])
    .send({ from: shared.user });
});

test('Invested amount must be above price minimum', async () => {
  const errorMessage = 'Invested amount too low';
  const price = '1000000000000000000';
  await shared.priceSource.methods
    .update(
      [shared.weth.options.address, shared.mln.options.address],
      [price, price],
    )
    .send({ from: shared.user, gas: 8000000 });
  await expect(
    shared.participation.methods
      .invest('1000', '1', shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);
});

test('Basic investment works', async () => {
  const investAmount = '1000';
  const sharesAmount = '1000';
  const preVaultWeth = await shared.weth.methods
    .balanceOf(shared.vault.options.address)
    .call();
  await shared.weth.methods
    .approve(shared.participation.options.address, investAmount)
    .send({ from: shared.user });
  await shared.participation.methods
    .invest(sharesAmount, investAmount, shared.weth.options.address)
    .send({ from: shared.user, gas: 8000000 });
  const postVaultWeth = await shared.weth.methods
    .balanceOf(shared.vault.options.address)
    .call();
  const postShares = await shared.shares.methods.balanceOf(shared.user).call();
  const postSupply = await shared.shares.methods.totalSupply().call();

  expect(postShares).toEqual(sharesAmount);
  expect(postSupply).toEqual(sharesAmount);
  expect(Number(postVaultWeth)).toEqual(
    Number(preVaultWeth) + Number(investAmount),
  );
});
