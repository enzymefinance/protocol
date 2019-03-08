import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { deployFundFactory } from '../transactions/deployFundFactory';
import { managersToHubs } from '../calls/managersToHubs';

describe('managersToHubs', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.fundFactoryAddress = await deployFundFactory(shared.env, {
      accountingFactoryAddress: randomAddress(),
      feeManagerFactoryAddress: randomAddress(),
      participationFactoryAddress: randomAddress(),
      policyManagerFactoryAddress: randomAddress(),
      sharesFactoryAddress: randomAddress(),
      tradingFactoryAddress: randomAddress(),
      vaultFactoryAddress: randomAddress(),
      versionAddress: randomAddress(),
    });
  });

  it('Manger with no hub ', async () => {
    await expect(
      managersToHubs(shared.env, shared.fundFactoryAddress, randomAddress()),
    ).resolves.toBeNull();
  });
});
