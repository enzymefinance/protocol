import { initTestEnvironment } from '~/utils/environment';
import { randomAddress } from '~/utils/helpers';
import { deployFundFactory } from '../';
import managersToHubs from './managersToHubs';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.fundFactoryAddress = await deployFundFactory({
    accountingFactoryAddress: randomAddress(),
    feeManagerFactoryAddress: randomAddress(),
    participationFactoryAddress: randomAddress(),
    sharesFactoryAddress: randomAddress(),
    tradingFactoryAddress: randomAddress(),
    vaultFactoryAddress: randomAddress(),
    policyManagerFactoryAddress: randomAddress(),
  });
});

test('Manger with no hub ', async () => {
  await expect(
    managersToHubs(shared.fundFactoryAddress, randomAddress()),
  ).rejects.toThrow();
});
