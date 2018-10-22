import { Quantity, BigInteger, Token } from '@melonproject/token-math';
import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { deploy as deployEngine, sellAndBurnMln } from '..';
import {
  deploy as deployToken,
  approve,
  getToken,
  balanceOf,
} from '~/contracts/dependencies/token';
import {
  Contract,
  deploy as deployContract,
  getContract,
} from '~/utils/solidity';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.env = getGlobalEnvironment();
  const mlnAddress = await deployToken('MLN');
  const versionAddress = await deployContract('version/MockVersion');
  shared.delay = 30 * 24 * 60 * 60;
  shared.engineAddress = await deployEngine(
    versionAddress,
    shared.priceSource,
    shared.delay,
    mlnAddress,
  );
  shared.mlnToken = await getToken(mlnAddress);
  shared.engine = await getContract(Contract.Engine, shared.engineAddress);
  shared.quantity = Quantity.createQuantity(
    shared.mlnToken,
    Token.appendDecimals(shared.mlnToken, 1),
  );
});

test('eth sent manually is not tracked', async () => {});
test('fails when eth sender not a fund', async () => {});
test('eth can be sent as AMGU from a fund', async () => {});
test('eth sent as AMGU is frozen and thaws', async () => {});
test('sell and burn', async () => {
  await approve(shared.quantity, shared.env.wallet.address);
  await sellAndBurnMln(shared.engineAddress, shared.quantity);
  expect(true).toBe(true);
});
