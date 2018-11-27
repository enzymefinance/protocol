import { Address } from '~/utils/types';
import { emptyAddress } from '~/utils/constants/emptyAddress';

export const isEmptyAddress = (address: Address) =>
  address.toString() === emptyAddress;
