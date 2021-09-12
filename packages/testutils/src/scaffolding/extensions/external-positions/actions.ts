import { AddressLike, extractEvent } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  encodeArgs,
  ExternalPositionManager,
  ExternalPositionManagerActionId,
  externalPositionReactivateArgs,
  externalPositionRemoveArgs,
  IExternalPositionProxy,
} from '@enzymefinance/protocol';
import { BigNumberish, BytesLike } from 'ethers';

export async function createExternalPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionTypeId,
  initializationData = '0x',
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionTypeId: BigNumberish;
  initializationData?: BytesLike;
}) {
  const receipt = await comptrollerProxy
    .connect(signer)
    .callOnExtension(
      externalPositionManager,
      ExternalPositionManagerActionId.CreateExternalPosition,
      encodeArgs(['uint256', 'bytes'], [externalPositionTypeId, initializationData]),
    );

  const event = extractEvent(receipt, externalPositionManager.abi.getEvent('ExternalPositionDeployedForFund'));

  const externalPositionProxy = new IExternalPositionProxy(event[0].args.externalPosition, signer);

  return { receipt, externalPositionProxy };
}

export async function reactivateExternalPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
}) {
  const callArgs = externalPositionReactivateArgs({ externalPositionProxy });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.ReactivateExternalPosition, callArgs);
}

export async function removeExternalPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
}) {
  const callArgs = externalPositionRemoveArgs({ externalPositionProxy });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(externalPositionManager, ExternalPositionManagerActionId.RemoveExternalPosition, callArgs);
}
