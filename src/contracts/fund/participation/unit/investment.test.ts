import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { Contracts } from '~/Contracts';
import { increaseTime } from '~/utils/evm/increaseTime';

const weekInSeconds = 60 * 60 * 24 * 7;

describe('investment', () => {
  let shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.user = shared.env.wallet.address;
    shared = Object.assign(
      shared,
      await deployMockSystem(shared.env, {
        accountingContract: Contracts.Accounting,
      }),
    );
    const price = '1000000000000000000';
    await shared.priceSource.methods
      .update(
        [shared.weth.options.address, shared.mln.options.address],
        [price, price],
      )
      .send({ from: shared.user, gas: 8000000 });

    await shared.registry.methods
      .setIsFund(shared.participation.options.address)
      .send({ from: shared.user });
  });

  it('Invest fails in shut down fund', async () => {
    const errorMessage = 'Hub is shut down';
    const amount = '1000000000000000000';
    await shared.hub.methods.setShutDownState(true).send({ from: shared.user });

    await expect(
      shared.participation.methods
        .requestInvestment(amount, amount, shared.weth.options.address)
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    await shared.hub.methods
      .setShutDownState(false)
      .send({ from: shared.user });
    await shared.weth.methods
      .approve(shared.participation.options.address, amount)
      .send({ from: shared.user });
    await shared.participation.methods
      .requestInvestment(amount, amount, shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });

    await shared.hub.methods.setShutDownState(true).send({ from: shared.user });

    await expect(
      shared.participation.methods
        .executeRequestFor(shared.user)
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    await shared.hub.methods
      .setShutDownState(false)
      .send({ from: shared.user });
    await increaseTime(shared.env, weekInSeconds);
    await shared.participation.methods
      .cancelRequest()
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
  });

  it('Request must exist to execute', async () => {
    const errorMessage = 'No valid request for this address';
    const requestExists = await shared.participation.methods
      .hasRequest(shared.user)
      .call();

    expect(requestExists).toBe(false);
    await expect(
      shared.participation.methods
        .executeRequestFor(shared.user)
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    await shared.participation.methods
      .requestInvestment(0, 0, shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });

    await expect(
      shared.participation.methods
        .executeRequestFor(shared.user)
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    await increaseTime(shared.env, weekInSeconds);
    await shared.participation.methods
      .cancelRequest()
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
  });

  it('Need fresh price to execute request', async () => {
    const errorMessage = 'Price not valid';
    const amount = '1000000000000000000';
    await shared.priceSource.methods
      .setNeverValid(true)
      .send({ from: shared.user });
    await shared.weth.methods
      .approve(shared.participation.options.address, amount)
      .send({ from: shared.user });
    await shared.participation.methods
      .requestInvestment(amount, amount, shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
    const requestExists = await shared.participation.methods
      .hasRequest(shared.user)
      .call();

    expect(requestExists).toBe(true);
    await expect(
      shared.participation.methods
        .executeRequestFor(shared.user)
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    await shared.priceSource.methods
      .setNeverValid(false)
      .send({ from: shared.user });
    await increaseTime(shared.env, weekInSeconds);
    await shared.participation.methods
      .cancelRequest()
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
  });

  it('Asset must be permitted', async () => {
    const errorMessage = 'Investment not allowed in this asset';
    const asset = `${randomAddress()}`;
    const amount = '100';
    const allowed = await shared.participation.methods
      .investAllowed(asset)
      .call();

    expect(allowed).toBe(false);

    await expect(
      shared.participation.methods
        .requestInvestment(amount, amount, asset)
        .send({ from: shared.user, gas: 8000000, value: 10 ** 16 }),
    ).rejects.toThrow(errorMessage);
  });

  it('Invested amount must be above price minimum', async () => {
    const errorMessage = 'Invested amount too low';
    const price = '1000000000000000000';
    await shared.priceSource.methods
      .update(
        [shared.weth.options.address, shared.mln.options.address],
        [price, price],
      )
      .send({ from: shared.user, gas: 8000000 });
    await shared.weth.methods
      .approve(shared.participation.options.address, '1000')
      .send({ from: shared.user });
    await shared.participation.methods
      .requestInvestment('1000', '1', shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });

    await expect(
      shared.participation.methods
        .executeRequestFor(shared.user)
        .send({ from: shared.user, gas: 8000000, value: 10 ** 16 }),
    ).rejects.toThrow(errorMessage);

    await increaseTime(shared.env, weekInSeconds);
    await shared.participation.methods
      .cancelRequest()
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
  });

  it('Basic investment works', async () => {
    const investAmount = '1000';
    const sharesAmount = '1000';
    const preVaultWeth = await shared.weth.methods
      .balanceOf(shared.vault.options.address)
      .call();
    await shared.weth.methods
      .approve(shared.participation.options.address, investAmount)
      .send({ from: shared.user });
    await shared.participation.methods
      .requestInvestment(
        sharesAmount,
        investAmount,
        shared.weth.options.address,
      )
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
    await shared.participation.methods
      .executeRequestFor(shared.user)
      .send({ from: shared.user, gas: 8000000, value: 10 ** 16 });
    const postVaultWeth = await shared.weth.methods
      .balanceOf(shared.vault.options.address)
      .call();
    const postShares = await shared.shares.methods
      .balanceOf(shared.user)
      .call();
    const postSupply = await shared.shares.methods.totalSupply().call();

    expect(postShares).toEqual(sharesAmount);
    expect(postSupply).toEqual(sharesAmount);
    expect(Number(postVaultWeth)).toEqual(
      Number(preVaultWeth) + Number(investAmount),
    );
  });
});
