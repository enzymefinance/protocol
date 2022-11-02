import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, IntegrationManager, ITestStandardToken } from '@enzymefinance/protocol';
import {
  aaveV2LendArgs,
  aaveV2RedeemArgs,
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { utils } from 'ethers';

export async function aaveV2Lend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  aaveV2Adapter,
  aToken,
  amount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  aaveV2Adapter: AddressLike;
  aToken: ITestStandardToken;
  amount?: BigNumberish;
}) {
  const lendArgs = aaveV2LendArgs({
    aToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: aaveV2Adapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function aaveV2Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  aaveV2Adapter,
  aToken,
  amount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  aaveV2Adapter: AddressLike;
  aToken: ITestStandardToken;
  amount?: BigNumberish;
}) {
  const redeemArgs = aaveV2RedeemArgs({
    aToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: aaveV2Adapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
