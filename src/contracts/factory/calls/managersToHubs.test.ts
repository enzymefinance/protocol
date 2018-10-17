import { initTestEnvironment } from '~/utils/environment';
import { randomAddress } from '~/utils/helpers';
import { deployFundFactory, managersToHubs } from '../';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.fundFactoryAddress = await deployFundFactory({
    accountingFactoryAddress: randomAddress(),
    feeManagerFactoryAddress: randomAddress(),
    participationFactoryAddress: randomAddress(),
    policyManagerFactoryAddress: randomAddress(),
    sharesFactoryAddress: randomAddress(),
    tradingFactoryAddress: randomAddress(),
    vaultFactoryAddress: randomAddress(),
  });
});

test('Manger with no hub ', async () => {
  await expect(
    managersToHubs(shared.fundFactoryAddress, randomAddress()),
  ).rejects.toThrow();
});
