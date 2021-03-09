import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  AaveAdapter,
  aaveLendArgs,
  aaveRedeemArgs,
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import { BigNumberish, utils } from 'ethers';

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
  aToken: StandardToken;
  amount?: BigNumberish;
}) {
  const lendArgs = aaveLendArgs({
    aToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: aaveAdapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
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
  aToken: StandardToken;
  amount?: BigNumberish;
}) {
  const redeemArgs = aaveRedeemArgs({
    aToken,
    amount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: aaveAdapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
