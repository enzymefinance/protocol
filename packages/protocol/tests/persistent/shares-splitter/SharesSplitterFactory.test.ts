import { randomAddress } from '@enzymefinance/ethers';
import type { SharesSplitterFactory } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture, deploySharesSplitter } from '@enzymefinance/testutils';

const randomAddressValue1 = randomAddress();
const randomAddressValue2 = randomAddress();
let fork: ProtocolDeployment;
let sharesSplitterFactory: SharesSplitterFactory;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  sharesSplitterFactory = fork.deployment.sharesSplitterFactory;
});

describe('deploy', () => {
  it('does not allow unequal arrays', async () => {
    await expect(
      deploySharesSplitter({
        sharesSplitterFactory,
        signer: fork.deployer,
        splitPercentages: [2500, 7500],
        splitUsers: [randomAddressValue1],
      }),
    ).rejects.toBeRevertedWith('Unequal arrays');
  });

  it('works as expected', async () => {
    const [signer] = fork.accounts;
    const user1 = randomAddressValue1;
    const user2 = randomAddressValue2;
    const feePercent1 = 2500;
    const feePercent2 = 7500;

    // The deployment event is tested in this helper
    const { receipt, sharesSplitterProxy } = await deploySharesSplitter({
      sharesSplitterFactory,
      signer,
      splitPercentages: [feePercent1, feePercent2],
      splitUsers: [user1, user2],
    });

    // Assert the split ratio is correctly set
    expect(await sharesSplitterProxy.getSplitPercentageForUser(user1)).toEqBigNumber(feePercent1);
    expect(await sharesSplitterProxy.getSplitPercentageForUser(user2)).toEqBigNumber(feePercent2);

    expect(receipt).toMatchInlineGasSnapshot('161551');
  });
});
