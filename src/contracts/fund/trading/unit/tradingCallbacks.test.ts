import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';

let shared: any = {};

const mockExchange = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  const mockAdapter = getContract(
    Contracts.MockAdapter,
    await deploy(Contracts.MockAdapter),
  );
  shared.trading = getContract(
    Contracts.Trading,
    await deploy(Contracts.Trading, [
      shared.hub.options.address,
      [mockExchange],
      [mockAdapter.options.address],
      [false],
    ]),
  );
});

// test('Make order associated callbacks add data', async () => {
//   const mockAdapter = getContract(
//     Contracts.MockAdapter, await deploy(Contracts.MockAdapter)
//   );
//   await shared.trading.methods.callOnExchange(
//     0,
//     takeOrderSignature,
//     [
//       web3.utils.randomHex(20),
//       web3.utils.randomHex(20),
//       web3.utils.randomHex(20),
//       web3.utils.randomHex(20),
//       web3.utils.randomHex(20),
//       web3.utils.randomHex(20)
//     ],
//     [0, 0, 0, 0, 0, 0, trade2.buyQuantity.toFixed(), 0],
//     `0x${Number(orderId).toString(16).padStart(64, "0")}`,
//     web3.utils.padLeft('0x0', 64),
//     web3.utils.padLeft('0x0', 64),
//     web3.utils.padLeft('0x0', 64),
//   ).send();
// });
