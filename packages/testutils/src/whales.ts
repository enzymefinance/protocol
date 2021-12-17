import { resolveAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';

/* eslint-disable sort-keys-fix/sort-keys-fix */
const whales = {
  // primitives
  bat: '0x12274c71304bc0e6b38a56b94d2949b118feb838',
  bnb: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  bnt: '0x7d1ed1601a12a172269436fa95fe156650603c1d',
  busd: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
  comp: '0x0f50d31b3eaefd65236dd3736b863cffa4c63c4e',
  crv: '0x4ce799e6eD8D64536b67dD428565d52A531B3640',
  dai: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
  knc: '0x09d51654bd9efbfcb56da3491989cc1444095fff',
  ldo: '0x3dba737ccc50a32a1764b493285dd51c8af6c278',
  link: '0xbe6977e08d4479c0a6777539ae0e8fa27be4e9d6',
  mana: '0xefb94ac00f1cee8a89d5c3f49faa799da6f03024',
  mln: '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d',
  ohm: '0x71a53aff36a699110d66d6bdfff2320caf8d2d59',
  rep: '0xc6a043b07d33b6f30d8cb501026c391cfd25abe1',
  ren: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  susd: '0xa5f7a39e55d7878bc5bd754ee5d6bd7a7662355b',
  sohm: '0xf280f037cdbda99727ddf5dfede91e68fa78605c',
  uni: '0x47173b170c64d16393a52e6c480b3ad8c302ba1e',
  usdc: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f',
  usdt: '0x5041ed759dd4afc3a72b8192c143f72f4724081a',
  weth: '0xe08A8b19e5722a201EaF20A6BC595eF655397bd5',
  zrx: '0x206376e8940e42538781cd94ef024df3c1e0fd43',
  // aTokens
  ausdc: '0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296',
  ausdt: '0x7d6149ad9a573a6e2ca6ebf7d4897c1b766841b4',
  // cTokens
  ccomp: '0xd74f186194ab9219fafac5c2fe4b3270169666db',
  cdai: '0xab4ce310054a11328685ece1043211b68ba5d082',
  ceth: '0x8aceab8167c80cb8b3de7fa6228b889bb1130ee8',
  cuni: '0x39d8014b4f40d2cbc441137011d32023f4f1fd87',
  cusdc: '0xe1ed4da4284924ddaf69983b4d813fb1be58c380',
  // ptTokens
  ptUsdc: '0xd18236cd213f39d078177b6f6908f0e44e88e4aa',
  // synths
  seth: '0xc34a7c65aa08cb36744bda8eeec7b8e9891e147c',
  seur: '0xc3f2f91723b16b95bef0619b2504c049075d5b0b',
  sxag: '0x40d68c490bf7262ec40048099aec23535f734be2',
  sxau: '0x92eb453b7b5b8d41edb44e2c8b8b53eb70a482c7',
  // misc
  lidoSteth: '0x31f644e2dd5d74f5c8d6d9de89dd517474d51800',
  eurs: '0x98ed26de6451db36246672df78ae7c50f2c76f6d',
  ust: '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621',
} as const;
/* eslint-enable sort-keys-fix/sort-keys-fix */

export type Whale = keyof typeof whales;
export type WhaleSigners<T extends Partial<Whale> = Whale> = Record<T, SignerWithAddress>;

export async function unlockWhale(token: Whale) {
  const address = resolveAddress(whales[token]);
  await provider.send('hardhat_impersonateAccount', [address]);

  return provider.getSignerWithAddress(address);
}

export async function unlockAllWhales() {
  const keys = Object.keys(whales) as Whale[];
  const signers = await Promise.all(keys.map(async (token) => unlockWhale(token)));

  return keys.reduce((carry, key, index) => {
    return { ...carry, [key]: signers[index] };
  }, {} as WhaleSigners);
}

export async function unlockWhales<T extends Whale>(...tokens: T[]) {
  const signers = await Promise.all(tokens.map(async (token) => unlockWhale(token)));

  return tokens.reduce((carry, key, index) => {
    return { ...carry, [key]: signers[index] };
  }, {} as WhaleSigners<T>);
}
