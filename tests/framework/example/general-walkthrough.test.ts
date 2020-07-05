import { contracts, fixtures } from '~/framework';
import {
  setupFundWithParams,
  assetWhitelistPolicy,
  managementFee,
  performanceFee,
} from '~/framework/fund';

describe('general walkthrough', () => {
  it('deploy a registry contract', async () => {
    const signer = ethersSigners[0];
    const address = await signer.getAddress();
    const registry = await contracts.Registry.deploy(
      signer,
      address,
      address,
    ).send();

    const mtc = await registry.MTC();
    expect(mtc).toEqual(address);
  });

  it('set up a fund', async () => {
    const fund = await setupFundWithParams({
      policies: [assetWhitelistPolicy([fixtures.WETH, fixtures.MLN])],
      fees: [managementFee(0.1, 30), performanceFee(0.1, 90)],
      adapters: [fixtures.KyberAdapter, fixtures.EngineAdapter],
    });

    const registered = await fixtures.Registry.fundIsRegistered(fund.hub);
    expect(registered).toBeTruthy();
  });
});
