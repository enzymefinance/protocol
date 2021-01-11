import { ChainlinkRateAsset } from '@enzymefinance/protocol';
import { DeploymentConfig, saveConfig } from './Config';
import { DeployFunction } from 'hardhat-deploy/types';

// Note that some addresses in this file are checksummed and others are not. This shouldn't be an issue.

// WETH is not included as it is auto-included in the chainlink price feed
const primitives = {
  aave: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
  adx: '0xade00c28244d5ce17d72e40330b1c318cd12b7c3',
  ant: '0xa117000000f279d81a1d3cc75430faa017fa5a2e',
  bal: '0xba100000625a3754423978a60c9317c58a424e3d',
  bat: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
  bnb: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
  bnt: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
  busd: '0x4fabb145d64652a948d72533023f6e7a623c7c53',
  bzrx: '0x56d811088235f11c8920698a204a5010a788f4b3',
  comp: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  cro: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b',
  crv: '0xd533a949740bb3306d119cc777fa900ba034cd52',
  dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  dmg: '0xEd91879919B71bB6905f23af0A68d231EcF87b14',
  enj: '0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c',
  knc: '0xdd974D5C2e2928deA5F71b9825b8b646686BD200',
  link: '0x514910771af9ca656af840dff83e8264ecf986ca',
  lrc: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
  mana: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
  mkr: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
  mln: '0xec67005c4E498Ec7f55E092bd1d35cbC47C91892',
  nmr: '0x1776e1f26f98b1a5df9cd347953a26dd3cb46671',
  oxt: '0x4575f41308ec1483f3d399aa9a2826d74da13deb',
  ren: '0x408e41876cccdc0f92210600ef50372656052a38',
  rep: '0x221657776846890989a759ba2973e427dff5c9bb',
  rlc: '0x607f4c5bb672230e8672085532f7e901544a7375',
  snx: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  susd: '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51',
  sxp: '0x8ce9137d39326ad0cd6491fb5cc0cba0e089b6a9',
  tusd: '0x0000000000085d4780B73119b644AE5ecd22b376',
  // uma: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828',
  uni: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7',
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
  bzrx: ['0x8f7c7181ed1a2ba41cfc3f5d064ef91b67daef66', ChainlinkRateAsset.ETH],
  comp: ['0x1b39ee86ec5979ba5c322b826b3ecb8c79991699', ChainlinkRateAsset.ETH],
  cro: ['0xcA696a9Eb93b81ADFE6435759A29aB4cf2991A96', ChainlinkRateAsset.ETH],
  crv: ['0x8a12be339b0cd1829b91adc01977caa5e9ac121e', ChainlinkRateAsset.ETH],
  dai: ['0x773616e4d11a78f511299002da57a0a94577f1f4', ChainlinkRateAsset.ETH],
  dmg: ['0xD010e899f7ab723AC93f825cDC5Aa057669557c2', ChainlinkRateAsset.ETH],
  enj: ['0x24d9ab51950f3d62e9144fdc2f3135daa6ce8d1b', ChainlinkRateAsset.ETH],
  knc: ['0x656c0544ef4c98a6a98491833a89204abb045d6b', ChainlinkRateAsset.ETH],
  link: ['0xdc530d9457755926550b59e8eccdae7624181557', ChainlinkRateAsset.ETH],
  lrc: ['0x160AC928A16C93eD4895C2De6f81ECcE9a7eB7b4', ChainlinkRateAsset.ETH],
  mana: ['0x82a44d92d6c329826dc557c5e1be6ebec5d5feb9', ChainlinkRateAsset.ETH],
  mkr: ['0x24551a8fb2a7211a25a17b1481f043a8a8adc7f2', ChainlinkRateAsset.ETH],
  mln: ['0xdaea8386611a157b08829ed4997a8a62b557014c', ChainlinkRateAsset.ETH],
  nmr: ['0x9cb2a01a7e64992d32a34db7ceea4c919c391f6a', ChainlinkRateAsset.ETH],
  oxt: ['0xd75AAaE4AF0c398ca13e2667Be57AF2ccA8B5de6', ChainlinkRateAsset.USD],
  ren: ['0x3147d7203354dc06d9fd350c7a2437bca92387a4', ChainlinkRateAsset.ETH],
  rep: ['0xd4ce430c3b67b3e2f7026d86e7128588629e2455', ChainlinkRateAsset.ETH],
  rlc: ['0x4cba1e1fdc738d0fe8db3ee07728e2bc4da676c6', ChainlinkRateAsset.ETH],
  snx: ['0x79291a9d692df95334b1a0b3b4ae6bc606782f8c', ChainlinkRateAsset.ETH],
  susd: ['0x8e0b7e6062272B5eF4524250bFFF8e5Bd3497757', ChainlinkRateAsset.ETH],
  sxp: ['0xFb0CfD6c19e25DB4a08D8a204a387cEa48Cc138f', ChainlinkRateAsset.USD],
  tusd: ['0x3886BA987236181D98F2401c507Fb8BeA7871dF2', ChainlinkRateAsset.ETH],
  // uma: ['0xf817b69ea583caff291e287cae00ea329d22765c', ChainlinkRateAsset.ETH],
  uni: ['0xd6aa3d25116d8da79ea0246c4826eb951872e02e', ChainlinkRateAsset.ETH],
  usdc: ['0x986b5e1e1755e3c2440e960477f25201b0a8bbd4', ChainlinkRateAsset.ETH],
  usdt: ['0xee9f2375b4bdf6387aa8265dd4fb8f16512a1d46', ChainlinkRateAsset.ETH],
  wbtc: ['0xdeb288f737066589598e9214e782fa5a8ed689e8', ChainlinkRateAsset.ETH],
  wnxm: ['0xe5dc0a609ab8bcf15d3f35cfaa1ff40f521173ea', ChainlinkRateAsset.ETH],
  yfi: ['0x7c5d4f8345e66f68099581db340cd65b078c41f4', ChainlinkRateAsset.ETH],
  zrx: ['0x2da4983a622a8498bb1a21fae9d8f6c664939962', ChainlinkRateAsset.ETH],
} as const;

const synths = {
  saud: '0xF48e200EAF9906362BB1442fca31e0835773b8B4', // sAUD
  sbnb: '0x617aeCB6137B5108D1E7D4918e3725C8cEbdB848', // sBNB
  sbtc: '0xfe18be6b3bd88a2d2a7f928d00292e7a9963cfc6', // sBTC
  sbch: '0x36a2422a863d5b950882190ff5433e513413343a', // sBCH
  sada: '0xe36e2d3c7c34281fa3bc737950a68571736880a1', // sADA
  scex: '0xeabacd844a196d7faf3ce596edebf9900341b420', // sCEX
  slink: '0xbbc455cb4f1b9e4bfc4b73970d360c8f032efee6', // sLINK
  sdash: '0xfe33ae95a9f0da8a845af33516edc240dcd711d6', // sDASH
  sdefi: '0xe1afe1fd76fd88f78cbf599ea1846231b8ba3b6b', // sDEFI
  seos: '0x88c8cf3a212c0369698d13fe98fcb76620389841', // sEOS
  seth: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb', // sETH
  setc: '0x22602469d704bffb0936c7a7cfcd18f7aa269375', // sETC
  seur: '0xd71ecff9342a5ced620049e616c5035f1db98620', // sEUR
  sftse: '0x23348160d7f5aca21195df2b70f28fce2b0be9fc', // sFTSE
  sxau: '0x261efcdd24cea98652b9700800a13dfbca4103ff', // sXAU
  ibnb: '0xafd870f32ce54efdbf677466b612bf8ad164454b', // iBNB
  ibtc: '0xd6014ea05bde904448b743833ddf07c3c7837481', // iBTC
  ibch: '0xf6e9b246319ea30e8c2fa2d1540aaebf6f9e1b89', // iBCH
  iada: '0x8a8079c7149b8a1611e5c5d978dca3be16545f83', // iADA
  icex: '0x336213e1ddfc69f4701fc3f86f4ef4a160c1159d', // iCEX
  ilink: '0x2d7ac061fc3db53c39fe1607fb8cec1b2c162b01', // iLINK
  idash: '0xcb98f42221b2c251a4e74a1609722ee09f0cc08e', // iDASH
  idefi: '0x14d10003807ac60d07bb0ba82caeac8d2087c157', // iDEFI
  ieos: '0xf4eebdd0704021ef2a6bbe993fdf93030cd784b4', // iEOS
  ieth: '0xa9859874e1743a32409f75bb11549892138bba1e', // iETH
  ietc: '0xd50c1746d835d2770dda3703b69187bffeb14126', // iETC
  iltc: '0x79da1431150c9b82d2e5dfc1c68b33216846851e', // iLTC
  ixmr: '0x4adf728e2df4945082cdd6053869f51278fae196', // iXMR
  ioil: '0xa5a5df41883cdc00c4ccc6e8097130535399d9a3', // iOIL
  ixrp: '0x27269b3e45a4d3e79a3d6bfee0c8fb13d0d711a6', // iXRP
  itrx: '0xc5807183a9661a533cb08cbc297594a0b864dc12', // iTRX
  ixtz: '0x8deef89058090ac5655a99eeb451a4f9183d1678', // iXTZ
  sjpy: '0xf6b1c627e95bfc3c1b4c9b825a032ff0fbf3e07d', // sJPY
  sltc: '0xc14103c2141e842e228fbac594579e798616ce7a', // sLTC
  sxmr: '0x5299d6f7472dcc137d7f3c4bcfbbb514babf341a', // sXMR
  snikkei: '0x757de3ac6b830a931ef178c6634c5c551773155c', // sNIKKEI
  soil: '0x6d16cf3ec5f763d4d99cb0b0b110eefd93b11b56', // sOIL
  sgbp: '0x97fe22e7341a0cd8db6f6c021a24dc8f4dad855f', // sGBP
  sxrp: '0xa2b0fde6d710e201d0d608e924a484d1a5fed57c', // sXRP
  sxag: '0x6a22e5e94388464181578aa7a6b869e00fe27846', // sXAG
  schf: '0x0f83287ff768d1c1e17a42f44d644d7f22e8ee1d', // sCHF
  strx: '0xf2e08356588ec5cd9e437552da87c0076b4970b0', // sTRX
  sxtz: '0x2e59005c5c0f0a4d77cca82653d48b46322ee5cd', // sXTZ
} as const;

const ctokens = {
  cbat: '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e', // cBAT
  ccomp: '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4', // cCOMP
  cdai: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643', // cDAI
  crep: '0x158079ee67fce2f58472a96584a73c7ab9ac95c1', // cREP
  cuni: '0x35A18000230DA775CAc24873d00Ff85BccdeD550', // cUNI
  cusdc: '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
  cusdt: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9', // cUSDT
  cwbtc: '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4', // cWBTC
  czrx: '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407', // cZRX
} as const;

const pools = {
  aaveWeth: '0xdfc14d2af169b0d36c4eff567ada9b2e0cae044f', // AAVE-WETH
  adxWeth: '0xd3772a963790fede65646cfdae08734a17cd0f47', // ADX-WETH
  antWeth: '0x9def9511fec79f83afcbffe4776b1d817dc775ae', // ANT-WETH
  balWeth: '0xa70d458a4d9bc0e6571565faee18a48da5c0d593', // BAL-WETH
  batWeth: '0xb6909b960dbbe7392d405429eb2b3649752b4838', // BAT-WETH
  bntWeth: '0x3fd4cf9303c4bc9e13772618828712c8eac7dd2f', // BNT-WETH
  busdUsdc: '0x524847c615639e76fe7d0fe0b16be8c4eac9cf3c', // BUSD-USDC
  busdUsdt: '0xa0abda1f980e03d7eadb78aed8fc1f2dd0fe83dd', // BUSD-USDT
  bzrxWeth: '0xb9b752f7f4a4680eeb327ffe728f46666763a796', // BZRX-WETH
  compWeth: '0xcffdded873554f362ac02f8fb1f02e5ada10516f', // COMP-WETH
  croWeth: '0x90704ac59e7e54632b0cc9d22573aecd7eb094ad', // CRO-WETH
  crvWeth: '0x3da1313ae46132a397d90d95b1424a9a7e3e0fce', // CRV-WETH
  daiUsdc: '0xae461ca67b15dc8dc81ce7615e0320da1a9ab8d5', // DAI-USDC
  daiUsdt: '0xb20bd5d04be54f870d5c0d3ca85d82b34b836405', // DAI-USDT
  daiWeth: '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11', // DAI-WETH
  dmgWeth: '0x8175362afbeee32afb22d05adc0bbd08de32f5ae', // DMG-WETH
  enjWeth: '0xe56c60b5f9f7b5fc70de0eb79c6ee7d00efa2625', // ENJ-WETH
  kncWeth: '0xf49c43ae0faf37217bdcb00df478cf793edd6687', // KNC-WETH
  linkWeth: '0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974', // LINK-WETH
  lrcWeth: '0x8878df9e1a7c87dcbf6d3999d997f262c05d8c70', // LRC-WETH
  manaWeth: '0x11b1f53204d03e5529f09eb3091939e4fd8c9cf3', // MANA-WETH
  mkrWeth: '0xc2adda861f89bbb333c90c492cb837741916a225', // MKR-WETH
  mlnWeth: '0x15ab0333985FD1E289adF4fBBe19261454776642', // MLN-WETH
  nmrWeth: '0xb784ced6994c928170b417bbd052a096c6fb17e2', // NMR-WETH
  oxtWeth: '0x9b533f1ceaa5ceb7e5b8994ef16499e47a66312d', // OXT-WETH
  renWeth: '0x8bd1661da98ebdd3bd080f0be4e6d9be8ce9858c', // REN-WETH
  repv2Weth: '0x8979a3ef9d540480342ac0f56e9d4c88807b1cba', // REPv2-WETH
  rlcWeth: '0x6d57a53a45343187905aad6ad8ed532d105697c1', // RLC-WETH
  snxWeth: '0x43ae24960e5534731fc831386c07755a2dc33d47', // SNX-WETH
  susdWeth: '0xf80758ab42c3b07da84053fd88804bcb6baa4b5c', // SUSD-WETH
  sxpWeth: '0xac317d14738a454ff20b191ba3504aa97173045b', // SXP-WETH
  tusdWeth: '0xb4d0d9df2738abe81b87b66c80851292492d1404', // TUSD-WETH
  // umaWeth: '0x88d97d199b9ed37c29d846d00d443de980832a22', // UMA-WETH
  uniWeth: '0xd3d2e2692501a5c9ca623199d38826e513033a17', // UNI-WETH
  usdcUsdt: '0x3041cbd36888becc7bbcbc0045e3b1f144466f5f', // USDC-USDT
  usdcWeth: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc', // USDC-WETH
  usdtWeth: '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852', // USDT-WETH
  wbtcUsdc: '0x004375dff511095cc5a197a54140a24efef3a416', // WBTC-USDC
  wbtcWeth: '0xbb2b8038a1640196fbe3e38816f3e67cba72d940', // WBTC-WETH
  wnxmWeth: '0x23bff8ca20aac06efdf23cee3b8ae296a30dfd27', // wNXM-WETH
  yfiWeth: '0x2fdbadf3c4d5a8666bc06645b8358ab803996e28', // YFI-WETH
  zrxWeth: '0xc6f348dd3b91a56d117ec0071c1e9b83c0996de4', // ZRX-WETH
} as const;

const ethUsdAggregator = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const xauUsdAggregator = '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6';

// prettier-ignore
const mainnetConfig: DeploymentConfig = {
  weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  primitives,
  chainlink: {
    ethusd: ethUsdAggregator,
    aggregators,
  },
  wdgld: {
    wdgld: '0x123151402076fc819B7564510989e475c9cD93CA',
    ethusd: ethUsdAggregator,
    xauusd: xauUsdAggregator,
  },
  synthetix: {
    snx: primitives.snx,
    susd: primitives.susd,
    synths,
    addressResolver: '0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2',
    delegateApprovals: '0x15fd6e554874B9e70F832Ed37f231Ac5E142362f',
    originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
    trackingCode: '0x454e5a594d450000000000000000000000000000000000000000000000000000',
  },
  compound: {
    ceth: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
    ctokens,
  },
  chai: {
    dai: primitives.dai,
    chai: '0x06af07097c9eeb7fd685c692751d5c66db49c215',
    pot: '0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7',
  },
  kyber: {
    networkProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  },
  paraswap: {
    augustusSwapper: '0x9509665d015Bfe3C77AA5ad6Ca20C8Afa1d98989',
    tokenTransferProxy: '0x0A87c89B5007ff406Ab5280aBdD80fC495ec238e',
  },
  uniswap: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    pools,
  },
  zeroex: {
    exchange: '0x080bf510fcbf18b91105470639e9561022937712',
    allowedMakers: [
      '0x56178a0d5F301bAf6CF3e1Cd53d9863437345Bf9',
      '0xe0238DA09Cab56B3066F26F98657DccE801c16B9'
    ],
  },
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: 300,
    },
  },
}

const fn: DeployFunction = async (hre) => {
  await saveConfig(hre, mainnetConfig);
};

fn.tags = ['Config'];

// Run this deployment step on all networks except kovan.
fn.skip = async (hre) => hre.network.name === 'kovan';

export default fn;
