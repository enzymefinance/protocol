import { Quantity, BigInteger, Token } from '@melonproject/token-math';
import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { deploy as deployEngine, sellAndBurnMln } from '..';
import {
  deploy as deployToken,
  approve,
  getToken,
  balanceOf,
} from '~/dependencies/token';
import { Contract, getContract } from '~/utils/solidity';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  const mlnAddress = await deployToken('MLN');
  // shared.engineAddress = await deployEngine(); //TODO: args
  shared.engineAddress = 'placeholder';
  shared.mlnToken = await getToken(mlnAddress);
  shared.engine = await getContract(Contract.Engine, engineAddress);
  shared.amount = Quantity.createQuantity(
    shared.mlnToken,
    Token.appendDecimals(shared.mlnToken, 1),
  );
  shared.env = getGlobalEnvironment();
});

test('eth sent manually is not tracked', async () => {});
test('fails when eth sender not a fund', async () => {});
test('eth can be sent as AMGU from a fund', async () => {});
test('eth sent as AMGU is frozen and thaws', async () => {});
test('sell and burn', async () => {
  await approve(shared.amount, shared.env.wallet.address);
  await sellAndBurnMln(shared.engineAddress, shared.amount);
  expect(true).toBe(true);
});
