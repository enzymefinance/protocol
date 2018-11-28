import { Address } from '@melonproject/token-math/address';

import { emptyAddress } from '~/utils/constants/emptyAddress';

export const isEmptyAddress = (address: Address) =>
  address.toString() === emptyAddress;
