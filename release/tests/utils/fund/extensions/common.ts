import { AddressLike } from '@crestproject/crestproject';
import { BytesLike, Signer } from 'ethers';
import { ComptrollerLib } from '../../../../utils/contracts';

export async function callOnExtension({
  comptrollerProxy,
  extension,
  selector,
  callArgs = '0x',
  signer,
}: {
  comptrollerProxy: ComptrollerLib;
  extension: AddressLike;
  selector: BytesLike;
  callArgs?: BytesLike;
  signer?: Signer;
}) {
  let callOnExtensionTx: any;

  if (signer) {
    callOnExtensionTx = comptrollerProxy
      .connect(signer)
      .callOnExtension(extension, selector, callArgs);
  } else {
    callOnExtensionTx = comptrollerProxy.callOnExtension(
      extension,
      selector,
      callArgs,
    );
  }
  await expect(callOnExtensionTx).resolves.toBeReceipt();

  return callOnExtensionTx;
}
