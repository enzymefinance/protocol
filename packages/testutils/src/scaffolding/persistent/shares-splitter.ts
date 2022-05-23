import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { SharesSplitterFactory } from '@enzymefinance/protocol';
import { SharesSplitterLib } from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

import { assertEvent } from '../../assertions';

export async function deploySharesSplitter({
  signer,
  sharesSplitterFactory,
  splitUsers,
  splitPercentages,
}: {
  signer: SignerWithAddress;
  sharesSplitterFactory: SharesSplitterFactory;
  splitUsers: AddressLike[];
  splitPercentages: BigNumberish[];
}) {
  const receipt = await sharesSplitterFactory.connect(signer).deploy(splitUsers, splitPercentages);

  // Get the deployed splitter via the validated event
  const proxyDeployedArgs = assertEvent(receipt, 'ProxyDeployed', {
    caller: signer,
    proxy: expect.any(String) as string,
  });
  const sharesSplitterProxy = new SharesSplitterLib(proxyDeployedArgs.proxy, provider);

  return { receipt, sharesSplitterProxy };
}
