import { ChainlinkRateAsset } from '@enzymefinance/protocol';
import type { DeploymentConfig } from '@enzymefinance/testutils';
import { constants } from 'ethers';
import type { DeployFunction } from 'hardhat-deploy/types';

import { saveConfig } from '../../utils/config';
import { isHomestead } from '../../utils/helpers';

// Note that some addresses in this file are checksummed and others are not. This shouldn't be an issue.

// Special assets
const mln = '0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const feeToken = mln;
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const wrappedNativeAsset = weth;

// WETH is not included as it is auto-included in the chainlink price feed.
// Derivatives registered as primitives for pricing purposes due to having a 1:1 value relationship (e.g., Aave aTokens)
// should be manually added via ValueInterpreter.ts.
const primitives = {
  aave: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
  adx: '0xade00c28244d5ce17d72e40330b1c318cd12b7c3',
  ant: '0xa117000000f279d81a1d3cc75430faa017fa5a2e',
  bal: '0xba100000625a3754423978a60c9317c58a424e3d',
  bat: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
  bnb: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
  bnt: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
  busd: '0x4fabb145d64652a948d72533023f6e7a623c7c53',
  comp: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  cro: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b',
  crv: '0xd533a949740bb3306d119cc777fa900ba034cd52',
  dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  enj: '0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c',
  knc: '0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202',
  kncl: '0xdd974D5C2e2928deA5F71b9825b8b646686BD200',
  ldo: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
  link: '0x514910771af9ca656af840dff83e8264ecf986ca',
  lrc: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
  lusd: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
  mana: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
  mkr: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
  mln,
  nmr: '0x1776e1f26f98b1a5df9cd347953a26dd3cb46671',
  ohm: '0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5',
  oxt: '0x4575f41308ec1483f3d399aa9a2826d74da13deb',
  paxg: '0x45804880de22913dafe09f4980848ece6ecbaf78',
  ren: '0x408e41876cccdc0f92210600ef50372656052a38',
  rep: '0x221657776846890989a759ba2973e427dff5c9bb',
  rlc: '0x607f4c5bb672230e8672085532f7e901544a7375',
  snx: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  sohm: '0x04906695D6D12CF5459975d7C3C03356E4Ccd460',
  steth: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  susd: '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51',
  sxp: '0x8ce9137d39326ad0cd6491fb5cc0cba0e089b6a9',
  uni: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  ust: '0xa47c8bf37f92abed4a126bda807a7b7498661acd',
  wbtc: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  wnxm: '0x0d438f3b5175bebc262bf23753c1e53d03432bde',
  yfi: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
  zrx: '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
} as const;

const aggregators = {
  aave: ['0x6Df09E975c830ECae5bd4eD9d90f3A95a4f88012', ChainlinkRateAsset.ETH],
  adx: ['0x231e764B44b2C1b7Ca171fa8021A24ed520Cde10', ChainlinkRateAsset.USD],
  ant: ['0x8f83670260f8f7708143b836a2a6f11ef0abac01', ChainlinkRateAsset.ETH],
  bal: ['0xc1438aa3823a6ba0c159cfa8d98df5a994ba120b', ChainlinkRateAsset.ETH],
  bat: ['0x0d16d4528239e9ee52fa531af613acdb23d88c94', ChainlinkRateAsset.ETH],
  bnb: ['0x14e613ac84a31f709eadbdf89c6cc390fdc9540a', ChainlinkRateAsset.USD],
  bnt: ['0xcf61d1841b178fe82c8895fe60c2edda08314416', ChainlinkRateAsset.ETH],
  busd: ['0x614715d2af89e6ec99a233818275142ce88d1cfd', ChainlinkRateAsset.ETH],
  comp: ['0x1b39ee86ec5979ba5c322b826b3ecb8c79991699', ChainlinkRateAsset.ETH],
  cro: ['0xcA696a9Eb93b81ADFE6435759A29aB4cf2991A96', ChainlinkRateAsset.ETH],
  crv: ['0x8a12be339b0cd1829b91adc01977caa5e9ac121e', ChainlinkRateAsset.ETH],
  dai: ['0x773616e4d11a78f511299002da57a0a94577f1f4', ChainlinkRateAsset.ETH],
  enj: ['0x24d9ab51950f3d62e9144fdc2f3135daa6ce8d1b', ChainlinkRateAsset.ETH],
  knc: ['0x656c0544ef4c98a6a98491833a89204abb045d6b', ChainlinkRateAsset.ETH],
  kncl: ['0x656c0544ef4c98a6a98491833a89204abb045d6b', ChainlinkRateAsset.ETH],
  ldo: ['0x4e844125952D32AcdF339BE976c98E22F6F318dB', ChainlinkRateAsset.ETH],
  link: ['0xdc530d9457755926550b59e8eccdae7624181557', ChainlinkRateAsset.ETH],
  lrc: ['0x160AC928A16C93eD4895C2De6f81ECcE9a7eB7b4', ChainlinkRateAsset.ETH],
  lusd: ['0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0', ChainlinkRateAsset.USD],
  mana: ['0x82a44d92d6c329826dc557c5e1be6ebec5d5feb9', ChainlinkRateAsset.ETH],
  mkr: ['0x24551a8fb2a7211a25a17b1481f043a8a8adc7f2', ChainlinkRateAsset.ETH],
  mln: ['0xdaea8386611a157b08829ed4997a8a62b557014c', ChainlinkRateAsset.ETH],
  nmr: ['0x9cb2a01a7e64992d32a34db7ceea4c919c391f6a', ChainlinkRateAsset.ETH],
  ohm: ['0x9a72298ae3886221820b1c878d12d872087d3a23', ChainlinkRateAsset.ETH],
  oxt: ['0xd75AAaE4AF0c398ca13e2667Be57AF2ccA8B5de6', ChainlinkRateAsset.USD],
  paxg: ['0x9b97304ea12efed0fad976fbecaad46016bf269e', ChainlinkRateAsset.USD],
  ren: ['0x3147d7203354dc06d9fd350c7a2437bca92387a4', ChainlinkRateAsset.ETH],
  rep: ['0xd4ce430c3b67b3e2f7026d86e7128588629e2455', ChainlinkRateAsset.ETH],
  rlc: ['0x4cba1e1fdc738d0fe8db3ee07728e2bc4da676c6', ChainlinkRateAsset.ETH],
  snx: ['0x79291a9d692df95334b1a0b3b4ae6bc606782f8c', ChainlinkRateAsset.ETH],
  sohm: ['0x9a72298ae3886221820b1c878d12d872087d3a23', ChainlinkRateAsset.ETH],
  steth: ['0xcfe54b5cd566ab89272946f602d76ea879cab4a8', ChainlinkRateAsset.USD],
  susd: ['0x8e0b7e6062272B5eF4524250bFFF8e5Bd3497757', ChainlinkRateAsset.ETH],
  sxp: ['0xFb0CfD6c19e25DB4a08D8a204a387cEa48Cc138f', ChainlinkRateAsset.USD],
  uni: ['0xd6aa3d25116d8da79ea0246c4826eb951872e02e', ChainlinkRateAsset.ETH],
  usdc: ['0x986b5e1e1755e3c2440e960477f25201b0a8bbd4', ChainlinkRateAsset.ETH],
  usdt: ['0xee9f2375b4bdf6387aa8265dd4fb8f16512a1d46', ChainlinkRateAsset.ETH],
  ust: ['0x8b6d9085f310396c6e4f0012783e9f850eaa8a82', ChainlinkRateAsset.USD],
  wbtc: ['0xdeb288f737066589598e9214e782fa5a8ed689e8', ChainlinkRateAsset.ETH],
  wnxm: ['0xe5dc0a609ab8bcf15d3f35cfaa1ff40f521173ea', ChainlinkRateAsset.ETH],
  yfi: ['0x7c5d4f8345e66f68099581db340cd65b078c41f4', ChainlinkRateAsset.ETH],
  zrx: ['0x2da4983a622a8498bb1a21fae9d8f6c664939962', ChainlinkRateAsset.ETH],
} as const;

const aaveV2Tokens = {
  aaave: '0xFFC97d72E13E01096502Cb8Eb52dEe56f74DAD7B',
  abal: '0x272F97b7a56a387aE942350bBC7Df5700f8a4576',
  abusd: '0xA361718326c15715591c299427c62086F69923D9',
  acrv: '0x8dAE6Cb04688C62d939ed9B68d32Bc62e49970b1',
  adai: '0x028171bCA77440897B824Ca71D1c56caC55b68A3',
  aenj: '0xaC6Df26a590F08dcC95D5a4705ae8abbc88509Ef',
  aknc: '0x39C6b3e42d6A679d7D776778Fe880BC9487C2EDA',
  alink: '0xa06bC25B5805d5F8d82847D191Cb4Af5A3e873E0',
  amana: '0xa685a61171bb30d4072B338c80Cb7b2c865c873E',
  amkr: '0xc713e5E149D5D0715DcD1c156a020976e7E56B88',
  aren: '0xCC12AbE4ff81c9378D670De1b57F8e0Dd228D77a',
  asnx: '0x35f6B052C598d933D69A4EEC4D04c73A191fE6c2',
  asusd: '0x6C5024Cd4F8A59110119C56f8933403A539555EB',
  auni: '0xB9D7CB55f463405CDfBe4E90a6D2Df01C2B92BF1',
  ausdc: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
  ausdt: '0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811',
  awbtc: '0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656',
  aweth: '0x030bA81f1c18d280636F32af80b9AAd02Cf0854e',
  ayfi: '0x5165d24277cD063F5ac44Efd447B27025e888f37',
  azrx: '0xDf7FF54aAcAcbFf42dfe29DD6144A69b629f8C9e',
};

const aaveV3Tokens = {};

const compoundV2CTokens = {
  cbat: '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e',
  ccomp: '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4',
  cdai: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
  cuni: '0x35A18000230DA775CAc24873d00Ff85BccdeD550',
  cusdc: '0x39aa39c021dfbae8fac545936693ac917d5e7563',
  cusdt: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
  cwbtc: '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
  cwbtc2: '0xccF4429DB6322D5C611ee964527D42E5d685DD6a',
  czrx: '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407',
} as const;

const compoundV3CTokens = {
  cusdc: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
} as const;

const pools = {
  aaveWeth: '0xdfc14d2af169b0d36c4eff567ada9b2e0cae044f',
  adxWeth: '0xd3772a963790fede65646cfdae08734a17cd0f47',
  antWeth: '0x9def9511fec79f83afcbffe4776b1d817dc775ae',
  balWeth: '0xa70d458a4d9bc0e6571565faee18a48da5c0d593',
  batWeth: '0xb6909b960dbbe7392d405429eb2b3649752b4838',
  bntWeth: '0x3fd4cf9303c4bc9e13772618828712c8eac7dd2f',
  busdUsdc: '0x524847c615639e76fe7d0fe0b16be8c4eac9cf3c',
  busdUsdt: '0xa0abda1f980e03d7eadb78aed8fc1f2dd0fe83dd',
  compWeth: '0xcffdded873554f362ac02f8fb1f02e5ada10516f',
  croWeth: '0x90704ac59e7e54632b0cc9d22573aecd7eb094ad',
  crvWeth: '0x3da1313ae46132a397d90d95b1424a9a7e3e0fce',
  daiUsdc: '0xae461ca67b15dc8dc81ce7615e0320da1a9ab8d5',
  daiUsdt: '0xb20bd5d04be54f870d5c0d3ca85d82b34b836405',
  daiWeth: '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11',
  enjWeth: '0xe56c60b5f9f7b5fc70de0eb79c6ee7d00efa2625',
  kncWeth: '0xf49c43ae0faf37217bdcb00df478cf793edd6687',
  linkWeth: '0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974',
  lrcWeth: '0x8878df9e1a7c87dcbf6d3999d997f262c05d8c70',
  manaWeth: '0x11b1f53204d03e5529f09eb3091939e4fd8c9cf3',
  mkrWeth: '0xc2adda861f89bbb333c90c492cb837741916a225',
  mlnWeth: '0x15ab0333985FD1E289adF4fBBe19261454776642',
  nmrWeth: '0xb784ced6994c928170b417bbd052a096c6fb17e2',
  oxtWeth: '0x9b533f1ceaa5ceb7e5b8994ef16499e47a66312d',
  paxgWeth: '0x9c4fe5ffd9a9fc5678cfbd93aa2d4fd684b67c4c',
  renWeth: '0x8bd1661da98ebdd3bd080f0be4e6d9be8ce9858c',
  repv2Weth: '0x8979a3ef9d540480342ac0f56e9d4c88807b1cba',
  rlcWeth: '0x6d57a53a45343187905aad6ad8ed532d105697c1',
  snxWeth: '0x43ae24960e5534731fc831386c07755a2dc33d47',
  susdWeth: '0xf80758ab42c3b07da84053fd88804bcb6baa4b5c',
  sxpWeth: '0xac317d14738a454ff20b191ba3504aa97173045b',
  uniWeth: '0xd3d2e2692501a5c9ca623199d38826e513033a17',
  usdcUsdt: '0x3041cbd36888becc7bbcbc0045e3b1f144466f5f',
  usdcWeth: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
  usdtWeth: '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852',
  wbtcUsdc: '0x004375dff511095cc5a197a54140a24efef3a416',
  wbtcWeth: '0xbb2b8038a1640196fbe3e38816f3e67cba72d940',
  wnxmWeth: '0x23bff8ca20aac06efdf23cee3b8ae296a30dfd27',
  yfiWeth: '0x2fdbadf3c4d5a8666bc06645b8358ab803996e28',
  zrxWeth: '0xc6f348dd3b91a56d117ec0071c1e9b83c0996de4',
} as const;

const yVaultsV2 = {
  yCrvSteth: '0xdCD90C7f6324cfa40d7169ef80b12031770B4325',
  yDai: '0x19D3364A399d251E894aC732651be8B0E4e85001',
  yUsdc: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
};

const unsupportedAssets = {
  iusd: '0x0A3BB08b3a15A19b4De82F8AcFc862606FB69A2D',
  izi: '0x9ad37205d608B8b219e6a2573f922094CEc5c200',
  perp: '0xbc396689893d065f41bc2c6ecbee5e0085233447',
  seth: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb',
  usf: '0xe0e05c43c097b0982db6c9d626c4eb9e95c3b9ce',
};

const ethUsdAggregator = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

// prettier-ignore
const mainnetConfig: DeploymentConfig = {
  aaveV2: {
    atokens: aaveV2Tokens,
    incentivesController: '0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5',
    lendingPool: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
    lendingPoolAddressProvider: '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5',
    protocolDataProvider: '0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d'
  },
  aaveV3: {
    atokens: aaveV3Tokens,
    pool: constants.AddressZero, // TODO: replace when on mainnet
    poolAddressProvider: constants.AddressZero, // TODO: replace when on mainnet
    referralCode: 0, // TODO: replace when referrals on mainnet
  },
  aura: {
    booster: '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234',
    auraToken: '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF',
  },
  balancer: {
    balToken: primitives.bal,
    vault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    helpers: "0x5aDDCCa35b7A0D07C74063c48700C8590E87864E",
    minter: '0x239e55F427D44C3cc793f49bFB507ebe76638a2b',
    poolsWeighted: {
      poolFactories: ["0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9", "0xA5bf2ddF098bb0Ef6d120C98217dD6B141c74EE0"],
      pools: {
        bal80Weth20: {
          id: '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014',
          gauge: constants.AddressZero // bal80-weth20 does not have a gauge
        },
        ohm50Dai25Weth25: {
          id: '0xc45d42f801105e861e86658648e3678ad7aa70f900010000000000000000011e',
          gauge: '0x852CF729dEF9beB9De2f18c97a0ea6bf93a7dF8B'
        },
      }
    },
    poolsStable: {
      // TODO: 2nd item is metastable pool factory, unsure if we can support with price feed
      poolFactories: ["0xc66Ba2B6595D3613CCab350C886aCE23866EDe24", "0x67d27634E44793fE63c467035E31ea8635117cd4"],
      pools: {
        // Balancer USD stable pool
        staBAL3: {
          id: '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000063',
          invariantProxyAsset: primitives.usdc,
          gauge: '0x34f33CDaED8ba0E1CEECE80e5f4a73bcf234cfac'
        },
        steth: {
          id: '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080',
          invariantProxyAsset: weth,
          gauge: '0xcD4722B7c24C29e0413BDCd9e51404B4539D14aE'
        }
      }
    }
  },
  chainlink: {
    aggregators,
    ethusd: ethUsdAggregator,
  },
  compoundV2: {
    ceth: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
    comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    ctokens: compoundV2CTokens
  },
  compoundV3: {
    configuratorProxy: '0x316f9708bB98af7dA9c68C1C3b5e79039cD336E3',
    rewards: '0x1B0e765F6224C21223AeA2af16c1C46E38885a40',
    ctokens: compoundV3CTokens
  },
  convex: {
    booster: '0xF403C135812408BFbE8713b5A23a04b3D48AAE31',
    crvToken: primitives.crv,
    cvxCrvStaking: '0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e',
    cvxToken: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
    vlCvx: '0x72a19342e8F1838460eBFCCEf09F6585e32db86E',
    vlCvxExtraRewards: '0x9B622f2c40b80EF5efb14c2B2239511FfBFaB702',
    votiumMultiMerkleStash: '0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A',
  },
  curve: {
    addressProvider: '0x0000000022D53366457F9d5E68Ec105046FC4383',
    minter: '0xd061D61a4d941c39E5453435B6345Dc261C2fcE0',
    nativeAssetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    poolOwner: '0xeCb456EA5365865EbAb8a2661B0c503410e9B347',
    pools: {
      '3pool': {
        hasReentrantVirtualPrice: false,
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: constants.AddressZero,
        lpToken: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
        pool: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7'
      },
      aave: {
        hasReentrantVirtualPrice: false,
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: '0xd662908ADA2Ea1916B3318327A97eB18aD588b5d',
        lpToken: '0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900',
        pool: '0xDeBF20617708857ebe4F679508E7b7863a8A8EeE'
      },
      mim: {
        hasReentrantVirtualPrice: false,
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: '0xB518f5e3242393d4eC792BD3f44946A3b98d0E48',
        lpToken: '0x55A8a39bc9694714E2874c1ce77aa1E599461E18',
        pool: '0x55A8a39bc9694714E2874c1ce77aa1E599461E18'
      },
      seth: {
        hasReentrantVirtualPrice: true,
        invariantProxyAsset: weth,
        liquidityGaugeToken: '0x3C0FFFF15EA30C35d7A85B85c0782D6c94e1d238',
        lpToken: '0xA3D87FffcE63B53E0d54fAa1cc983B7eB0b74A9c',
        pool: '0xc5424B857f758E906013F3555Dad202e4bdB4567'
      },
      steth: {
        hasReentrantVirtualPrice: true,
        invariantProxyAsset: weth,
        liquidityGaugeToken: '0x182B723a58739a9c974cFDB385ceaDb237453c28',
        lpToken: '0x06325440D014e39736583c165C2963BA99fAf14E',
        pool: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022'
      },
      usdt: {
        hasReentrantVirtualPrice: false,
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: constants.AddressZero,
        lpToken: '0x9fc689ccada600b6df723d9e47d84d76664a1f23',
        pool: '0x52ea46506b9cc5ef470c5bf89f17dc28bb35d85c'
      },
      ust: {
        hasReentrantVirtualPrice: false,
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: '0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855',
        lpToken: '0x94e131324b6054c0D789b190b2dAC504e4361b53',
        pool: '0x890f4e345B1dAED0367A877a1612f86A1f86985f'
      },
    },
    virtualPriceDeviationThreshold: 50, // 0.5%
  },
  feeBps: 50,
  feeToken,
  feeTokenBurn: {
    burnFromVault: true,
    externalBurnerAddress: constants.AddressZero,
    sendToProtocolFeeReserve: false,
  },
  goldfinch: {
    fidu: '0x6a445E9F40e0b97c92d0b8a3366cEF1d67F700BF',
    seniorPool: '0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822',
  },
  gsn: {
    relayHub: '0x9e59Ea5333cD4f402dAc320a04fafA023fe3810D',
    relayWorker: '0x1fd0c666094d8c5dae247aa6c3c4c33fd21bdc91',
    trustedForwarder: '0xca57e5d6218aeb093d76372b51ba355cfb3c6cd0',
  },
  idle: {
    bestYieldIdleDai: '0x3fE7940616e5Bc47b0775a0dccf6237893353bB4',
    bestYieldIdleSusd: '0xf52cdcd458bf455aed77751743180ec4a595fd3f',
    bestYieldIdleUsdc: '0x5274891bEC421B39D23760c04A6755eCB444797C',
    bestYieldIdleUsdt: '0xF34842d05A1c888Ca02769A633DF37177415C2f8',
    bestYieldIdleWbtc: '0x8C81121B15197fA0eEaEE1DC75533419DcfD3151',
    riskAdjustedIdleDai: '0xa14eA0E11121e6E951E87c66AFe460A00BCD6A16',
    riskAdjustedIdleUsdc: '0x3391bc034f2935ef0e1e41619445f998b2680d35',
    riskAdjustedIdleUsdt: '0x28fAc5334C9f7262b3A3Fe707e250E01053e07b5',
  },
  kiln: {
    stakingContract: '0x0816DF553a89c4bFF7eBfD778A9706a989Dd3Ce3'
  },
  lido: {
    steth: primitives.steth,
    wsteth: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'
  },
  liquity: {
    borrowerOperations: '0x24179CD81c9e782A4096035f7eC97fB8B783e007',
    troveManager: '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2'
  },
  maple: {
    mplRewardsV1Factory: '0x0155729EbCd47Cb1fBa02bF5a8DA20FaF3860535',
    v2Globals: '0x804a6F5F667170F545Bf14e5DDB48C70B788390C',
    pools: {
      mavenUsdc: {
        poolV1: '0x6F6c8013f639979C84b756C7FC1500eB5aF18Dc4',
        poolV2: '0xd3cd37a7299B963bbc69592e5Ba933388f70dc88',
      }
    }
  },
  notional: {
    notionalContract: '0x1344A36A1B56144C3Bc62E7757377D288fDE0369'
  },
  olympusV2: {
    stakingContract: '0xB63cac384247597756545b500253ff8E607a8020'
  },
  paraSwapV5: {
    augustusSwapper: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57',
    feePartner: constants.AddressZero,
    feePercent: 0,
    tokenTransferProxy: '0x216B4B4Ba9F3e719726886d34a177484278Bfcae',
  },
  poolTogetherV4: {
    ptTokens: {
      ptUsdc: ["0xdd4d117723C257CEe402285D3aCF218E9A8236E1", primitives.usdc] as [string, string]
    }
  },
  positionsLimit: 20,
  primitives,
  snapshot: {
    delegateRegistry: '0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446'
  },
  solvFinanceV2: {
    bonds: {
      initialOfferingMarket: '0x2e2E940c7041A2948934175a81908bAA8adc6AFe',
      manualPriceOracle: '0x86d6Fa3485f9a69549Ccd767d4Ca084d4eEFF89a',
      priceOracleManager: '0xbfe7e3ea57b89ea978732e4aa05af86291b93766',
      vouchers:{
        bviUsdWeth: {underlying: unsupportedAssets.iusd, pool: '0xf498875333A794Fe586430793db1B84070B040A0', voucher: '0xf4F7139b1FcC5Cac2f573Cc4B684Cc75367A9cfD'},
        bviZiBit: {underlying: unsupportedAssets.izi, pool: '0x4910441fAA90e74c7e5F8BD88aB27B4893814D62', voucher: '0xf4d5F535695b70459EBF73796a7447950308bb71' }},
    },
    convertibles: {
      initialOfferingMarket: '0x83208b368c34dac1a0f8b616f278ed42f1ffb8cd',
      manualPriceOracle: '0x19337144D223B0cA0d3d19472f4b848D2B6E45e2',
      market: '0x962e18f89d27Cfc84c8fFA2ec7C90b3D933AD685',
      priceOracleManager: '0x7b430d4ffd1bc1f635b9375c5dc602df44e2edc4',
      vouchers: {
        perp: {underlying: unsupportedAssets.perp, pool: '0xe8865b89576866da3f9b7fc868e057fb37f9b5a5', voucher: '0x2d53f42b2edf8907bcaa4d3f28e6f76bd95334e3'},
        usf: {underlying: unsupportedAssets.usf, pool: '0xa2c9d8c01f42db434b9ba91678f6cb6999e5bf57', voucher: '0xbF50337eD0Ff20Fa4d5702BF2DA187E2C217D034' }}
    },
    deployer: '0x21bc9179d5c529b52e3ee8f6ecf0e63fa231d16c'
  },
  synthetix: {
    delegateApprovals: '0x15fd6e554874B9e70F832Ed37f231Ac5E142362f',
    originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
    redeemer: '0xe533139Af961c9747356D947838c98451015e234',
    snx: primitives.snx,
    susd: primitives.susd,
    trackingCode: '0x454e5a594d450000000000000000000000000000000000000000000000000000',
  },
  theGraph: {
    grt: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
    stakingProxy: '0xf55041e37e12cd407ad00ce2910b8269b01263b9',
  },
  uniswap: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    pools,
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  },
  uniswapV3: {
    nonFungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564'
  },
  unsupportedAssets,
  weth,
  wrappedNativeAsset,
  yearn: {
    vaultV2: {
      registry: '0x50c1a2eA0a861A967D9d0FFE2AE4012c2E053804',
      yVaults: yVaultsV2
    }
  },
  zeroex: {
    allowedMakers: [
      '0x56178a0d5F301bAf6CF3e1Cd53d9863437345Bf9',
      '0xe0238DA09Cab56B3066F26F98657DccE801c16B9'
    ],
    exchange: '0x080bf510fcbf18b91105470639e9561022937712',
  },
}

const fn: DeployFunction = async (hre) => {
  await saveConfig(hre, mainnetConfig);
};

fn.tags = ['Config'];

fn.skip = async (hre) => {
  // Run this only for mainnet & mainnet forks.
  const chain = await hre.getChainId();

  return !isHomestead(chain);
};

export default fn;
