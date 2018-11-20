import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
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
      .requestInvestment(amount, amount, shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.hub.methods.setShutDownState(false).send({ from: shared.user });
  await shared.participation.methods
    .requestInvestment(amount, amount, shared.weth.options.address)
    .send({ from: shared.user, gas: 8000000 });

  await shared.hub.methods.setShutDownState(true).send({ from: shared.user });

  await expect(
    shared.participation.methods
      .executeRequest()
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.hub.methods.setShutDownState(false).send({ from: shared.user });
});

test('Request must exist to execute', async () => {
  console.log(shared.participation.options.address);
  console.log(shared.weth.options.address);
  console.log(shared.priceSource.options.address);
  console.log(await shared.participation.methods.routes().call());
  console.log(shared.user);
  console.log(await shared.participation.methods.requests(shared.user).call());
  const errorMessage = 'No request for this address';
  await shared.participation.methods
    .cancelRequest()
    .send({ from: shared.user, gas: 8000000 });
  const requestExists = await shared.participation.methods
    .hasRequest(shared.user)
    .call();

  expect(requestExists).toBe(false);
  await expect(
    shared.participation.methods
      .executeRequest()
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.participation.methods
    .requestInvestment(0, 0, shared.weth.options.address)
    .send({ from: shared.user, gas: 8000000 });

  await expect(
    shared.participation.methods
      .executeRequest()
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);
});

test('Need fresh price to executeRequest', async () => {
  const errorMessage = 'Price not recent';
  const amount = '1000000000000000000';
  await shared.participation.methods
    .requestInvestment(amount, amount, shared.weth.options.address)
    .send({ from: shared.user, gas: 8000000 });
  const requestExists = await shared.participation.methods
    .hasRequest(shared.user)
    .call();

  expect(requestExists).toBe(true);
  await expect(
    shared.participation.methods
      .executeRequestFor(shared.user)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);
});
