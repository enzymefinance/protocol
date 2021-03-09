import { AddressLike, Contract, contract, resolveAddress, Send } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  CompoundAdapter,
  compoundArgs,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  VaultLib,
} from '@enzymefinance/protocol';
import { BigNumberish, utils } from 'ethers';

// prettier-ignore
export interface ICompoundComptroller extends Contract<ICompoundComptroller> {
      claimComp: Send<(_account: AddressLike) => void>;
    }

export const ICompoundComptroller = contract<ICompoundComptroller>()`
      function claimComp(address)
    `;

export async function compoundLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const lendArgs = await compoundArgs({
    cToken: resolveAddress(cToken),
    outgoingAssetAmount: tokenAmount,
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
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const redeemArgs = await compoundArgs({
    cToken: resolveAddress(cToken),
    outgoingAssetAmount: cTokenAmount,
    minIncomingAssetAmount: tokenAmount,
  });

  const callArgs = await callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
