import { Address } from '@melonproject/token-math';

import { emptyAddress } from '~/utils/constants/emptyAddress';

export const isEmptyAddress = (address: Address) =>
  address.toString() === emptyAddress;
