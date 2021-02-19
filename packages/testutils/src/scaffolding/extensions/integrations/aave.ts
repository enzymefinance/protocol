import { SignerWithAddress } from '@crestproject/crestproject';
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
  outgoingToken,
  amount = utils.parseEther('1'),
  incomingAToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  aaveAdapter: AaveAdapter;
  outgoingToken: StandardToken;
  amount?: BigNumberish;
  incomingAToken: StandardToken;
}) {
  const lendArgs = aaveLendArgs({
    outgoingToken,
    amount,
    incomingAToken,
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
  outgoingAToken,
  amount = utils.parseEther('1'),
  incomingToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  aaveAdapter: AaveAdapter;
  outgoingAToken: StandardToken;
  amount?: BigNumberish;
  incomingToken: StandardToken;
}) {
  const redeemArgs = aaveRedeemArgs({
    outgoingAToken,
    amount,
    incomingToken,
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
