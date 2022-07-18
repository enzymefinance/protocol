import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { AaveAdapter, ComptrollerLib, IntegrationManager, ITestStandardToken } from '@enzymefinance/protocol';
import {
  aaveLendArgs,
  aaveRedeemArgs,
  callOnIntegrationArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { utils } from 'ethers';

export async function aaveLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  aaveAdapter,
  aToken,
  amount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  aaveAdapter: AaveAdapter;
  aToken: ITestStandardToken;
  amount?: BigNumberish;
}) {
  const lendArgs = aaveLendArgs({
    aToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: aaveAdapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function aaveRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  aaveAdapter,
  aToken,
  amount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  aaveAdapter: AaveAdapter;
  aToken: ITestStandardToken;
  amount?: BigNumberish;
}) {
  const redeemArgs = aaveRedeemArgs({
    aToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: aaveAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
