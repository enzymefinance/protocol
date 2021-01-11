import { EthereumTestnetProvider } from '@crestproject/crestproject';
import {
  ISynthetixDelegateApprovals,
  MockSynthetixIntegratee,
  MockSynthetixToken,
  StandardToken,
} from '@enzymefinance/protocol';
import { randomizedTestDeployment } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  return provider.snapshot(randomizedTestDeployment);
}

it('it cannot transfer after an exchange', async () => {
  const {
    accounts: [sender, recipient],
    config: {
      deployer,
      derivatives: {
        synthetix: { sbtc },
      },
      integratees: {
        synthetix: { delegateApprovals, susd, snx },
      },
    },
  } = await provider.snapshot(snapshot);

  const susdToken = new StandardToken(susd, deployer);

  const outgoingAmount = utils.parseEther('100');
  susdToken.transfer(sender, outgoingAmount);

  const iDelegateApprovals = new ISynthetixDelegateApprovals(delegateApprovals, sender);
  await iDelegateApprovals.approveExchangeOnBehalf(sender);

  const synthetix = new MockSynthetixIntegratee(snx, sender);

  await synthetix.exchangeOnBehalfWithTracking(
    sender,
    utils.formatBytes32String('sUSD'),
    outgoingAmount,
    utils.formatBytes32String('sBTC'),
    sender,
    utils.formatBytes32String('NONE'),
  );

  const incomingAsset = new MockSynthetixToken(sbtc, sender);
  const incomingAssetAmount = await incomingAsset.balanceOf(sender);

  await expect(incomingAsset.transfer(recipient, incomingAssetAmount)).rejects.toBeRevertedWith(
    'Cannot settle during waiting period',
  );
});
