import { fixtures } from '~/framework';
import { GanacheProvider } from '~/framework/ganache/provider';
import {
  setupFundWithParams,
  assetWhitelistPolicy,
  managementFee,
  performanceFee,
} from '~/framework/fund';

async function fixture(provider: GanacheProvider) {
  const [manager] = provider.accounts;
  const factory = fixtures.FundFactory.connect(manager);
  const registry = fixtures.Registry.connect(provider);

  const fund = await setupFundWithParams({
    factory,
    policies: [assetWhitelistPolicy([fixtures.WETH, fixtures.MLN])],
    fees: [managementFee(0.1, 30), performanceFee(0.1, 90)],
    adapters: [
      fixtures.KyberAdapter.connect(provider),
      fixtures.EngineAdapter.connect(provider),
    ],
  });

  return { fund, manager, registry };
}

describe('general walkthrough', () => {
  const provider = GanacheProvider.fork();

  it('do something with a fund from a test fixture', async () => {
    const snapshot = await provider.snapshot(fixture);
    const registered = await snapshot.registry.fundIsRegistered(
      snapshot.fund.hub,
    );

    expect(registered).toBeTruthy();
    // Check that any method was called on the Registry contract
    expect(snapshot.registry).toHaveBeenCalledOnContract();
  });

  it('do something else with the same fund on clean state', async () => {
    const snapshot = await provider.snapshot(fixture);
    const registered = await snapshot.registry.fundIsRegistered(
      snapshot.fund.hub,
    );

    expect(registered).toBeTruthy();
    // Check that any method was called on the Registry contract
    expect(snapshot.registry).toHaveBeenCalledOnContract();
  });

  it('and again re-use the same fund from with clean state', async () => {
    const snapshot = await provider.snapshot(fixture);
    const registered = await snapshot.registry.fundIsRegistered(
      snapshot.fund.hub,
    );

    expect(registered).toBeTruthy();
    // Check that any method was called on the Registry contract
    expect(snapshot.registry).toHaveBeenCalledOnContract();
  });
});
