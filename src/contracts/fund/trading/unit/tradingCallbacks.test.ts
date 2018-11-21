import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import {
  makeOrderSignature,
  takeOrderSignature,
  emptyAddress,
} from '~/utils/constants';

let shared: any = {};

const mockExchange = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = await Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  const mockAdapter = await getContract(
    Contracts.MockAdapter,
    await deploy(Contracts.MockAdapter),
  );
  shared.trading = await getContract(
    Contracts.Trading,
    await deploy(Contracts.Trading, [
      shared.hub.options.address,
      [mockExchange],
      [mockAdapter.options.address],
      [false],
    ]),
  );
  await shared.trading.methods
    .initialize([
      emptyAddress,
      emptyAddress,
      emptyAddress,
      shared.policyManager.options.address,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
    ])
    .send({ from: shared.user, gas: 8000000 });
});

test('Make order associated callbacks add data', async () => {
  await shared.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
      ],
      [0, 0, 0, 0, 0, 0, 100, 0],
      `0x${Number(1)
        .toString(16)
        .padStart(64, '0')}`,
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: shared.user, gas: 8000000 });
});
