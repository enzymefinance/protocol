import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
});

test('Invest fails in shut down fund', async () => {
  const errorMessage = 'Cannot invest in shut down fund';
  await shared.hub.methods.setShutDownState(true).send({ from: shared.user });

  await expect(
    shared.participation.methods
      .requestInvestment('1', '1', shared.weth.options.address)
      .send({ from: shared.user, gas: 8000000 }),
  ).rejects.toThrow(errorMessage);

  await shared.hub.methods.setShutDownState(false).send({ from: shared.user });
  console.log(shared.participation.options.address);
  await shared.participation.methods
    .requestInvestment('1', '1', shared.weth.options.address)
    .send({ from: shared.user, gas: 8000000 });

  await shared.hub.methods.setShutDownState(true).send({ from: shared.user });
});
