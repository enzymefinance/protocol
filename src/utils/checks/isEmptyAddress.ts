import { Address } from '~/utils/types';
import { emptyAddress } from '~/utils/constants';

export const isEmptyAddress = (address: Address) =>
  address.toString() === emptyAddress;
