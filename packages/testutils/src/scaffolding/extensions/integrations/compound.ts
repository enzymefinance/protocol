import { utils, BigNumberish } from 'ethers';
import { SignerWithAddress } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  CompoundAdapter,
  ICERC20,
  StandardToken,
  compoundArgs,
  callOnIntegrationArgs,
  lendSelector,
  IntegrationManagerActionId,
  redeemSelector,
} from '@melonproject/protocol';

export async function compoundLend({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  token,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  token: StandardToken;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    await token.transfer(vaultProxy, tokenAmount);
  }

  const lendArgs = compoundArgs({
    outgoingAsset: token,
    outgoingAssetAmount: tokenAmount,
    incomingAsset: cToken,
    minIncomingAssetAmount: cTokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function compoundRedeem({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  token,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  token: StandardToken;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    await cToken.transfer(vaultProxy, cTokenAmount);
  }

  const redeemArgs = compoundArgs({
    outgoingAsset: cToken,
    outgoingAssetAmount: cTokenAmount,
    incomingAsset: token,
    minIncomingAssetAmount: tokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
