import { signatureUtils } from '@0x/order-utils';
import { Order, SignedOrder, SignatureType } from '@0x/types';
import { Address } from '@melonproject/token-math/address';
import { Environment } from '~/utils/environment/Environment';

// This is just a reference implementation
const signOrder = async (
  environment: Environment,
  order: Order,
  signer?: Address,
): Promise<SignedOrder> => {
  // const orderHash = orderHashUtils.getOrderHashHex(order);
  // const web3signature = await environment.eth.sign(
  //   orderHash,
  //   environment.wallet.address.toString(),
  // );
  const orderSigner = (signer || environment.wallet.address).toLowerCase();
  const signedOrder = await signatureUtils.ecSignOrderAsync(
    environment.eth.currentProvider,
    order,
    orderSigner,
  );
  const signatureTyped =
    signedOrder.makerAddress.toLowerCase() === orderSigner
      ? signedOrder
      : {
          ...signedOrder,
          signature: `${signedOrder.signature.slice(0, -1)}${
            SignatureType.PreSigned
          }`,
        };
  return signatureTyped;
};

export { signOrder };
