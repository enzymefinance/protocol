import { ethers } from 'ethers';
import { Contract } from '~/framework/contract';

// TODO: Properly type the truffle build artifact.
export type Artifact = any;
export type AddressLike = string | Contract | ethers.Wallet;
