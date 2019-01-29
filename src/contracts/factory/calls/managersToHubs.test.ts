import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { deployFundFactory } from '../transactions/deployFundFactory';
import { deployRegistry } from '~/contracts/version/transactions/deployRegistry';
import { managersToHubs } from '../calls/managersToHubs';

describe('managersToHubs', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    const registryAddress = await deployRegistry(shared.env, randomAddress());
    shared.fundFactoryAddress = await deployFundFactory(shared.env, {
      accountingFactoryAddress: randomAddress(),
      feeManagerFactoryAddress: randomAddress(),
      participationFactoryAddress: randomAddress(),
      policyManagerFactoryAddress: randomAddress(),
      registryAddress: registryAddress.toString(),
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
