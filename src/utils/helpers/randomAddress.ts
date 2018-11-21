import * as Web3Utils from 'web3-utils';
import { Address } from '~/utils/types';

export const randomAddress = () =>
  new Address(Web3Utils.randomHex(20)).toLowerCase();
