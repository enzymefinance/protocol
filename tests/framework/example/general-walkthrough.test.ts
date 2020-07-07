import { fixtures, contracts } from '~/framework';
import { GanacheProvider } from '~/framework/ganache/provider';
import {
  setupFundWithParams,
  assetWhitelistPolicy,
  userWhitelistPolicy,
  managementFee,
  performanceFee,
  requestShares,
} from '~/framework/fund';
import { fromArtifact, transferToken, approveToken } from '~/framework/utils';
import { ethers } from 'ethers';

async function fixture(provider: GanacheProvider) {
  const [deployer, manager, disallowed, allowed] = provider.accounts;
  const registry = fixtures.Registry.connect(provider);

  const fund = await setupFundWithParams({
    factory: fixtures.FundFactory.connect(manager),
    policies: [
      userWhitelistPolicy([allowed]),
      assetWhitelistPolicy([fixtures.WETH, fixtures.MLN]),
    ],
    fees: [managementFee(0.1, 30), performanceFee(0.1, 90)],
    adapters: [
      fixtures.KyberAdapter.connect(provider),
      fixtures.EngineAdapter.connect(provider),
    ],
  });

  return { deployer, manager, disallowed, allowed, fund, registry };
}

describe('general walkthrough', () => {
  const provider = GanacheProvider.fork();

  it('request shares fails for whitelisted user with no allowance', async () => {
    const { allowed, fund } = await provider.snapshot(fixture);
    const requestor = fromArtifact(contracts.SharesRequestor, allowed);

    await expect(requestShares({ fund, requestor })).transactionRevertsWith(
      'Actual allowance is less than _investmentAmount',
    );
  });

  it('buying shares (initial investment) fails for user not on whitelist', async () => {
    const { disallowed, deployer, fund } = await provider.snapshot(fixture);
    const requestor = fromArtifact(contracts.SharesRequestor, disallowed);

    await transferToken(fixtures.WETH.connect(deployer), disallowed);
    await approveToken(fixtures.WETH.connect(disallowed), requestor);

    await expect(requestShares({ fund, requestor })).transactionRevertsWith(
      'Rule evaluated to false: USER_WHITELIST',
    );
  });

  it('buying shares (initial investment) succeeds for whitelisted user with allowance', async () => {
    const { allowed, deployer, fund } = await provider.snapshot(fixture);
    const requestor = fromArtifact(contracts.SharesRequestor, allowed);
    const amount = ethers.utils.parseEther('1');
    const shares = ethers.utils.parseEther('1');

    await transferToken(fixtures.WETH.connect(deployer), allowed);
    await approveToken(fixtures.WETH.connect(allowed), requestor);
    await requestShares({ fund, requestor, amount, shares });

    const balance = await fund.shares.balanceOf(allowed);
    expect(balance).bigNumberEq(shares);
  });

  it('cannot invest in a shutdown fund', async () => {
    const { allowed, fund } = await provider.snapshot(fixture);
    const requestor = fromArtifact(contracts.SharesRequestor, allowed);

    await fund.hub.shutDownFund().send();
    await expect(requestShares({ fund, requestor })).transactionRevertsWith(
      'Fund is not active',
    );
  });

  it('fund can take an order on oasisdex', async () => {
    // TODO
  });
});
