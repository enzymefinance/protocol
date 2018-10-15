import { Address } from '~/utils/types';
import { emptyAddress } from '~/utils/constants';

const isEmptyAddress = (address: Address) =>
  address.toString() === emptyAddress;

export default isEmptyAddress;
