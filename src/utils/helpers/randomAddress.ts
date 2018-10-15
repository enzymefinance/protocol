import * as Web3Utils from 'web3-utils';
import { Address } from '~/utils/types';

const randomAddress = () => new Address(Web3Utils.randomHex(20));

export default randomAddress;
