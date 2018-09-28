import * as fs from "fs";
import * as pkgInfo from "../../package.json";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
// import * as exchangeInfo from "../info/exchangeInfo";
import { deployContract, retrieveContract } from "../lib/contracts";
import { setupKyberDevEnv } from "../../utils/lib/setupKyberDevEnv";
import { makeOrderSignature, takeOrderSignature, cancelOrderSignature, swapTokensSignature } from "../../utils/lib/data";
import web3, { resetProvider } from "../lib/web3";
import governanceAction from "../lib/governanceAction";
import getChainTime from "../../utils/lib/getChainTime";
import createStakingFeed from "../lib/createStakingFeed";

// import verifyDeployment from "./verify";

const BigNumber = require("bignumber.js");

// Constants and mocks
const kovanHostedNode = "https://kovan.infura.io:443";
const addressBookFile = "./addressBook.json";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const yearInSeconds = 60 * 60 * 24 * 365;

// TODO: make clearer the separation between deployments in different environments
// TODO: make JSdoc style documentation tags here
async function deployEnvironment(environment) {
  const config = masterConfig[environment];
  if (config === undefined) {
    throw new Error(`Deployment for environment ${environment} not defined`);
  } else {
    // Switch to kovan hosted node if local is not available
    let nodeNetId;
    try {
      nodeNetId = Number(await web3.eth.net.getId());
    }
    catch (e) {
      if (environment === "kovan") await resetProvider(web3, kovanHostedNode);
      nodeNetId = Number(await web3.eth.net.getId());
    }
    // Check network ids
    if(nodeNetId !== Number(config.networkId) && config.networkId !== "*") {
      throw new Error(`Network ID of node (${nodeNetId}) did not match ID in config "${environment}" (${config.networkId})`);
    }
  }
  const accounts = await web3.eth.getAccounts();
  const opts = {
    from: accounts[0],
    gas: 8000000,
    gasPrice: config.gasPrice,
  };

  const deployed = {};

  if (environment === "kovan" || environment === "kovanCompetition") {
    // const deploymentAddress = "0x4288c8108837bd04bc656ee3aeb8e643f79a0756";
    const deploymentAddress = "0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd";
    const pricefeedUpdaterAddress = "0x35703012d6d353c33ef006c22dfd04a04dd6523a";
    opts.from = deploymentAddress;
    /* eslint-disable global-require */
    /* eslint-disable import/no-unresolved */
    const previous = require('../../addressBook.json').kovan;
    const commonEnvironment = "kovan";

    // set up governance and tokens
    // deployed.Governance = await deployContract("system/Governance", opts, [[deploymentAddress], 1, yearInSeconds]);
    deployed.Governance = await retrieveContract("system/Governance", previous.Governance);
    const mlnAddr = tokenInfo[commonEnvironment]["MLN-T"].address;
    const ethTokenAddress = tokenInfo[commonEnvironment]["WETH-T"].address;
    const mlnToken = await retrieveContract("assets/Asset", mlnAddr);

    // deployed.CanonicalPriceFeed = await retrieveContract("pricefeeds/CanonicalPriceFeed", previous.CanonicalPriceFeed);
    deployed.KyberNetworkProxy = await retrieveContract("exchange/thirdparty/kyber/KyberNetworkProxy", "0x7e6b8b9510D71BF8EF0f893902EbB9C865eEF4Df");
    deployed.KyberAdapter = await retrieveContract("exchange/adapter/KyberAdapter", "0xb101f0D07Aee56363FbBdeC630c142BC7A917e49");
    deployed.KyberPriceFeed = await retrieveContract("pricefeeds/KyberPriceFeed", previous.KyberPriceFeed);
    // deployed.KyberPriceFeed = await deployContract("pricefeeds/KyberPriceFeed", opts, [
    //   deployed.KyberNetworkProxy.options.address,
    //   ethTokenAddress,
    //   web3.utils.padLeft(web3.utils.toHex('ETH token'), 34),
    //   web3.utils.padLeft(web3.utils.toHex('ETH-T'), 34),
    //   18,
    //   'ethereum.org',
    //   mockBytes,
    //   [mockAddress, mockAddress],
    //   [],
    //   [],
    //   deployed.Governance.options.address
    // ]);
//     deployed.StakingPriceFeed = await retrieveContract("pricefeeds/StakingPriceFeed", previous.StakingPriceFeed);
//     deployed.MatchingMarket = await retrieveContract("exchange/thirdparty/MatchingMarket", previous.MatchingMarket);
//     deployed.MatchingMarketAdapter = await retrieveContract("exchange/adapter/MatchingMarketAdapter", previous.MatchingMarketAdapter);
//     deployed.ZeroExTokenTransferProxy = await retrieveContract("exchange/thirdparty/0x/TokenTransferProxy", previous.ZeroExTokenTransferProxy);
//     deployed.ZeroExExchange = await retrieveContract("exchange/thirdparty/0x/Exchange", previous.ZeroExExchange);
//     deployed.ZeroExV1Adapter = await retrieveContract("exchange/adapter/ZeroExV1Adapter", previous.ZeroExV1Adapter);

    // // set up pricefeeds
    // deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
    //   mlnAddr,
    //   ethTokenAddress,
    //   web3.utils.padLeft(web3.utils.toHex('Eth Token'), 34),
    //   web3.utils.padLeft(web3.utils.toHex('WETH-T'), 10),
    //   18,
    //   'ethereum.org',
    //   mockBytes,
    //   [mockAddress, mockAddress],
    //   [],
    //   [],
    //   [
    //     config.protocol.pricefeed.interval,
    //     config.protocol.pricefeed.validity
    //   ], [
    //     config.protocol.staking.minimumAmount,
    //     config.protocol.staking.numOperators,
    //     config.protocol.staking.unstakeDelay
    //   ],
    //   pricefeedUpdaterAddress
    //   // deployed.Governance.options.address
    // ], () => {}, true);

    // below not needed right now (TODO: remove in cleanup if still here)
    // deployed.StakingPriceFeed = await createStakingFeed(opts, deployed.CanonicalPriceFeed);
    // await mlnToken.instance.approve.postTransaction(
    //   opts,
    //   [
    //     deployed.StakingPriceFeed.options.address,
    //     config.protocol.staking.minimumAmount
    //   ]
    // );
    // await deployed.StakingPriceFeed.instance.depositStake.postTransaction(
    //   opts, [config.protocol.staking.minimumAmount, ""]
    // );

    // // set up exchanges and adapters
    // deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [154630446100]); // number is expiration date for market
    // deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);

    // const quoteSymbol = "WETH-T";
    // const pairsToWhitelist = [];
    // config.protocol.pricefeed.assetsToRegister.forEach((sym) => {
    //   if (sym !== quoteSymbol)
    //     pairsToWhitelist.push([quoteSymbol, sym]);
    // });

    // for (const pair of pairsToWhitelist) {
    //   console.log(`Whitelisting ${pair}`);
    //   const tokenA = tokenInfo[commonEnvironment][pair[0]].options.address;
    //   const tokenB = tokenInfo[commonEnvironment][pair[1]].options.address;
    //   await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(opts, [tokenA, tokenB]);
    // }

    deployed.MatchingMarket = await retrieveContract("exchange/thirdparty/MatchingMarket", previous.MatchingMarket);
    deployed.MatchingMarketAdapter = await retrieveContract("exchange/adapter/MatchingMarketAdapter", previous.MatchingMarketAdapter);
    deployed.ZeroExTokenTransferProxy = await retrieveContract("exchange/thirdparty/0x/TokenTransferProxy", previous.ZeroExTokenTransferProxy);
    deployed.ZeroExExchange = await retrieveContract("exchange/thirdparty/0x/Exchange", previous.ZeroExExchange)
    deployed.ZeroExV1Adapter = await retrieveContract("exchange/adapter/ZeroExV1Adapter", previous.ZeroExV1Adapter)

    // deployed.ZeroExTokenTransferProxy = await deployContract(
    //   "exchange/thirdparty/0x/TokenTransferProxy", opts
    // );
    // deployed.ZeroExExchange = await deployContract("exchange/thirdparty/0x/Exchange", opts,
    //   [ "0x0", deployed.ZeroExTokenTransferProxy.options.address ]
    // );
    // deployed.ZeroExV1Adapter = await deployContract("exchange/adapter/ZeroExV1Adapter", opts);
    // await deployed.ZeroExTokenTransferProxy.instance.addAuthorizedAddress.postTransaction(
    //   opts, [ deployed.ZeroExExchange.options.address ]
    // );

    // // set up modules and version
    // deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    // deployed.OnlyManager = await deployContract("compliance/OnlyManager", opts);
    // deployed.NoComplianceCompetition = await deployContract("compliance/NoComplianceCompetition", opts, []);
    // deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [deploymentAddress]);
    // deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.NoRiskMgmt = await retrieveContract("riskmgmt/NoRiskMgmt", previous.NoRiskMgmt);

    deployed.NoCompliance = await retrieveContract("compliance/NoCompliance", previous.NoCompliance);
    deployed.OnlyManager = await retrieveContract("compliance/OnlyManager", previous.OnlyManager);
    deployed.RMMakeOrders = await retrieveContract("riskmgmt/RMMakeOrders", previous.RMMakeOrders);
    deployed.NoComplianceCompetition = await retrieveContract("compliance/NoComplianceCompetition", previous.NoComplianceCompetition);
    deployed.CompetitionCompliance = await retrieveContract("compliance/CompetitionCompliance", previous.CompetitionCompliance);
    deployed.OnlyManagerCompetition = await retrieveContract("compliance/OnlyManagerCompetition", previous.OnlyManagerCompetition);

    let complianceAddress;
    if (environment === "kovan") {
      complianceAddress = deployed.OnlyManagerCompetition.options.address;
    } else if (environment === "kovanCompetition") {
      complianceAddress = deployed.CompetitionCompliance.options.address;
    }

    // // Fund ranking deployment
    // deployed.FundRanking = await deployContract("FundRanking", opts);
    deployed.FundRanking = await retrieveContract("FundRanking", previous.FundRanking);

    // // Deploy Version
    // deployed.Version = await deployContract(
    //   "version/Version",
    //   opts,
    //   [
    //     pkgInfo.version, deployed.Governance.options.address, mlnAddr,
    //     ethTokenAddress, deployed.KyberPriceFeed.options.address, deployed.NoCompliance.options.address
    //   ],
    //   () => {}, true
    // );
    deployed.Version = await retrieveContract("version/Version", previous.Version);

    // const blockchainTime = await getChainTime();
    // deployed.Competition = await deployContract(
    //   "competitions/Competition",
    //   opts,
    //   [
    //     mlnAddr, deployed.Version.options.address, deploymentAddress,
    //     blockchainTime, blockchainTime + 8640000, 38 * 10 ** 18, 15 * 10 ** 18, 1000
    //   ]
    // );
    // await deployed.Competition.instance.batchAddToWhitelist.postTransaction(
    //   opts,
    //   [10 ** 25, [deploymentAddress, "0xa80b5f4103c8d027b2ba88be9ed9bb009bf3d46f"]]
    // );
    // if (environment === "kovanCompetition") {
    //   await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(opts, [deployed.Competition.options.address]);
    // } else if (environment === "kovan") {
    //   deployed.TestCompetition = await deployContract(
    //     "competitions/TestCompetition",
    //     opts,
    //     [
    //       mlnAddr, deployed.Version.options.address, deploymentAddress,
    //       blockchainTime, blockchainTime + 8640000, 38 * 10 ** 18, 15 * 10 ** 18, 1000
    //     ]
    //   );
    // }
    // await mlnToken.instance.transfer.postTransaction(opts,
    //   [deployed.Competition.options.address, 10 ** 22],
    // );

    // add Version to Governance tracking
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.options.address]);
    console.log('Registered in governance');

    // whitelist exchanges
    if(!await deployed.KyberPriceFeed.methods.exchangeIsRegistered(deployed.MatchingMarket.options.address)) {
      await deployed.KyberPriceFeed.methods.registerExchange(
        deployed.MatchingMarket.options.address,
        deployed.MatchingMarketAdapter.options.address,
        true,
        [
          makeOrderSignature,
          takeOrderSignature,
          cancelOrderSignature
        ]
      ).send({from: pricefeedUpdaterAddress, gas: 6000000});
      console.log('Registered MatchingMarket');
    }

    if(!await deployed.KyberPriceFeed.methods.exchangeIsRegistered(deployed.ZeroExExchange.options.address)) {
      await deployed.KyberPriceFeed.methods.registerExchange(
        deployed.ZeroExExchange.options.address,
        deployed.ZeroExV1Adapter.options.address,
        false,
        [ takeOrderSignature ]
      ).send(
        {from: pricefeedUpdaterAddress, gas: 6000000}
      );
      console.log('Registered ZeroEx');
    }

    if(!await deployed.KyberPriceFeed.methods.exchangeIsRegistered(deployed.KyberNetworkProxy.options.address)) {
      await deployed.KyberPriceFeed.methods.registerExchange(
        deployed.KyberNetworkProxy.options.address,
        deployed.KyberAdapter.options.address,
        false,
        [ swapTokensSignature ]
      ).send(
        {from: pricefeedUpdaterAddress, gas: 6000000}
      );
      console.log('Registered Kyber');
    }

    // register assets
    for (const assetSymbol of config.protocol.pricefeed.assetsToRegister) {
      const tokenEntry = tokenInfo[commonEnvironment][assetSymbol];
      if(await deployed.KyberPriceFeed.methods.assetIsRegistered(tokenEntry.address).call()) {
        continue;
      }
      console.log(`Registering ${assetSymbol}`);
      await deployed.KyberPriceFeed.methods.registerAsset(
        tokenEntry.address,
        web3.utils.padLeft(web3.utils.toHex(tokenEntry.name), 34),
        web3.utils.padLeft(web3.utils.toHex(assetSymbol), 10),
        tokenEntry.decimals,
        tokenEntry.url,
        mockBytes,
        [mockAddress, mockAddress],
        [],
        []
      ).send(
        {from: pricefeedUpdaterAddress, gas: 6000000}
      );
      console.log(`Registered ${assetSymbol}`);
    }

    // // whitelist exchanges
    // await governanceAction(
    //   opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    //   [
    //     deployed.MatchingMarket.options.address,
    //     deployed.MatchingMarketAdapter.options.address,
    //     true,
    //     [
    //       makeOrderSignature,
    //       takeOrderSignature,
    //       cancelOrderSignature
    //     ]
    //   ]
    // );
    // console.log('Registered MatchingMarket');

    // await governanceAction(
    //  opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    //   [
    //     deployed.ZeroExExchange.options.address,
    //     deployed.ZeroExV1Adapter.options.address,
    //     false,
    //     [ takeOrderSignature ]
    //   ]
    // );
    // console.log('Registered ZeroEx');

    // // register assets
    // for (const assetSymbol of config.protocol.pricefeed.assetsToRegister) {
    //   console.log(`Registering ${assetSymbol}`);
    //   const tokenEntry = tokenInfo[commonEnvironment][assetSymbol];
    //   await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
    //     tokenEntry.address,
    //     web3.utils.padLeft(web3.utils.toHex(tokenEntry.name), 34),
    //     web3.utils.padLeft(web3.utils.toHex(assetSymbol), 10),
    //     tokenEntry.decimals,
    //     tokenEntry.url,
    //     mockBytes,
    //     [mockAddress, mockAddress],
    //     [],
    //     []
    //   ]);
    //   console.log(`Registered ${assetSymbol}`);
    // }
  } else if (environment === "live") {
    const deployer = config.protocol.deployer;
    // const pricefeedUpdater = config.protocol.pricefeed.updater;
    opts.from = deployer;
    // const pricefeedUpdaterPassword = '';
    // const authority = config.protocol.governance.authorities[0];
    // const authorityPassword = '';
    // opts.from = pricefeedUpdater;
    const mlnAddr = tokenInfo[environment].MLN.address;
    const ethTokenAddress = tokenInfo[environment].WETH.address;

    // deployed.Governance = await deployContract("system/Governance", {from: deployer}, [
    //   config.protocol.governance.authorities,
    //   config.protocol.governance.quorum,
    //   config.protocol.governance.window
    // ]);

    deployed.Governance = await retrieveContract("system/Governance", "0x630f5e265112dB10D1e7820E26718172a12BD084");

    // await unlock(authority, authorityPassword);
    // deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed",
    //   {from: authority, gas: 6900000 },
    //   [
    //     mlnAddr,
    //     ethTokenAddress,
    //     'Wrapped Ether token',
    //     'WETH',
    //     18,
    //     mockBytes,
    //     mockBytes,
    //     [mockAddress, mockAddress],
    //     [],
    //     [],
    //     [
    //       config.protocol.pricefeed.interval,
    //       config.protocol.pricefeed.validity,
    //     ], [
    //       config.protocol.staking.minimumAmount,
    //       config.protocol.staking.numOperators,
    //       config.protocol.staking.unstakeDelay
    //     ],
    //     pricefeedUpdater,  // single address performing update calls instead of multisig
    //     // deployed.Governance.options.address,
    //   ],
    //   () => {}, true
    // );

    deployed.CanonicalPriceFeed = await retrieveContract("pricefeeds/CanonicalPriceFeed", "0x3875151E877cb7C048D9b8F5045dEBF46bABE02b");

    // exchanges should already be deployed (third-party) and assets should be whitelisted

    // // deploy exchange adapters
    // deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);
    // deployed.ZeroExV1Adapter = await deployContract("exchange/adapter/ZeroExV1Adapter", opts);

    // retrieve exchanges
    deployed.MatchingMarket = await retrieveContract("exchange/thirdparty/MatchingMarket", "0x14fbca95be7e99c15cc2996c6c9d841e54b79425");
    deployed.ZeroExExchange = await retrieveContract("exchange/thirdparty/0x/Exchange", "0x12459c951127e0c374ff9105dda097662a027093");
    deployed.ZeroExTokenTransferProxy = await retrieveContract("exchange/thirdparty/0x/TokenTransferProxy", "0x8da0d80f5007ef1e431dd2127178d224e32c2ef4");

    // retrieve exchange adapters (instead of deploy)
    deployed.MatchingMarketAdapter = await retrieveContract("exchange/adapter/MatchingMarketAdapter", "0x752e85aE6297B17f42c1619008Ad8c2271f1C30f");
    deployed.ZeroExV1Adapter = await retrieveContract("exchange/adapter/ZeroExV1Adapter", "0x4A3943269C581eFCbd0875A7c60Da1C35a7C85c2");
    deployed.BugBountyCompliance = await retrieveContract("compliance/BugBountyCompliance", "0xD42316be0E813104096ab537FeE2fe0f5076bB2F");
    deployed.CompetitionCompliance = await retrieveContract("compliance/CompetitionCompliance", "0x9c76C260d4e72b87B398635313D3fAB11E83b7B3");

    // risk management modules
    deployed.OnlyManager = await retrieveContract("compliance/OnlyManager", '0xa7c621d9fe8566585A6BB44a6EaA4e714e4D6496');
    deployed.RMMakeOrders = await retrieveContract("riskmgmt/RMMakeOrders", '0xa1285Eec7ED4e1D65e55F50F564dCFF40237105a');
    deployed.NoRiskMgmt = await retrieveContract("riskmgmt/NoRiskMgmt", '0xDB0E414F86F94E69b5be00B5dF8a85f793F94AcA');

    deployed.Version = await deployContract(
      "version/Version",
      {from: deployer, gas: 6900000, gasPrice: 4000000000},
      [
        pkgInfo.version, deployed.Governance.options.address, mlnAddr, ethTokenAddress,
        deployed.CanonicalPriceFeed.options.address, deployed.CompetitionCompliance.options.address
      ], () => {}, true
    );
    // deployed.Version = await retrieveContract("version/Version", "0x58727Ae4791e6E7E25707062DA4084EdF0cb9Aa2");

    deployed.Fundranking = await retrieveContract("FundRanking", '0xE52eE3dB0587170DEb20B1c71B17229A28b79A9b');

    // add Version to Governance tracking
    // NB: be sure that relevant authority account is unlocked
    // console.log('Adding version to Governance tracking');
    // await governanceAction({from: authority}, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.options.address]);
    // NB: this is not needed when using third-party exchanges
    // // whitelist exchanges
    // // TODO: make sure that authority account is unlocked for this section
    // console.log('registering exchange');
    // await governanceAction(
    //   opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    //   [
    //     // TODO: replace with deployed MatchingMarket
    //     // deployed.MatchingMarket.options.address,
    //     "0x14fbca95be7e99c15cc2996c6c9d841e54b79425",
    //     deployed.MatchingMarketAdapter.options.address,
    //     true,
    //     [
    //       makeOrderSignature,
    //       takeOrderSignature,
    //       cancelOrderSignature
    //     ]
    //   ]
    // );

    // console.log('registering MatchingMarket exchange');
    // await deployed.CanonicalPriceFeed.instance.registerExchange.postTransaction(
    //   opts,
    //   [
    //     "0x14fbca95be7e99c15cc2996c6c9d841e54b79425",
    //     deployed.MatchingMarketAdapter.options.address,
    //     true,
    //     [
    //       makeOrderSignature,
    //       takeOrderSignature,
    //       cancelOrderSignature
    //     ]
    //   ]
    // );

    // console.log('registering 0x exchange');
    // await deployed.CanonicalPriceFeed.instance.registerExchange.postTransaction(
    //   opts,
    //   [
    //     "0x12459c951127e0c374ff9105dda097662a027093",
    //     deployed.ZeroExV1Adapter.options.address,
    //     false,
    //     [
    //       takeOrderSignature,
    //     ]
    //   ]
    // );

    // // register assets
    // await Promise.all(
    //   config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
    //     console.log(`Registering ${assetSymbol}`);
    //     // await unlock(pricefeedUpdater, pricefeedUpdaterPassword);
    //     const tokenEntry = tokenInfo[environment][assetSymbol];
    //     await governanceAction(
    //       {from: authority, gas: 500000},
    //       deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
    //         tokenEntry.options.address,
    //         tokenEntry.name,
    //         assetSymbol,
    //         tokenEntry.decimals,
    //         tokenEntry.url,
    //         mockBytes,
    //         [mockAddress, mockAddress],
    //         [],
    //         []
    //       ]
    //     );
    //     console.log(`Registered ${assetSymbol}`);
    //   })
    // );

    // // register assets (from updater)
    // await Promise.all(
    //   config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
    //     console.log(`Registering ${assetSymbol}`);
    //     const tokenEntry = tokenInfo[environment][assetSymbol];
    //     await deployed.CanonicalPriceFeed.instance.registerAsset.postTransaction(
    //       {from: pricefeedUpdater, gas: 500000},
    //       [
    //         tokenEntry.address,
    //         tokenEntry.name,
    //         assetSymbol,
    //         tokenEntry.decimals,
    //         tokenEntry.url,
    //         mockBytes,
    //         [mockAddress, mockAddress],
    //         [],
    //         []
    //       ]
    //     );
    //     console.log(`Registered ${assetSymbol}`);
    //   })
    // );

    deployed.Competition = await deployContract(
      "competitions/Competition",
      opts,
      [
        mlnAddr, deployed.Version.options.address, config.protocol.competition.custodian,
        config.protocol.competition.startTime, config.protocol.competition.endTime,
        config.protocol.competition.mlnPerEth, config.protocol.competition.totalMaxBuyin,
        config.protocol.competition.maxRegistrants
      ]
    );
    await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(opts, [deployed.Competition.options.address]);
    // then need to whitelist participants
  } else if (environment === "development") {
    [opts.from] = accounts;
    const blockchainTime = await getChainTime();
    deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, 100000]);
    deployed.EthToken =  await deployContract("assets/WETH9", opts);
    deployed.MlnToken = await deployContract("assets/PreminedAsset", opts, [18]);
    deployed.EurToken = await deployContract("assets/PreminedAsset", opts,  [18]);
    await deployed.EthToken.methods.deposit().send({from: accounts[0], value: new BigNumber(10 ** 26)});
    deployed.KyberNetworkProxy = await deployContract(
      "exchange/thirdparty/kyber/KyberNetworkProxy",
      opts,
      [accounts[0]]
    );
    deployed.CanonicalPriceFeed = await deployContract("pricefeeds/KyberPriceFeed", opts, [
      deployed.KyberNetworkProxy.options.address,
      deployed.EthToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('ETH token'), 34),
      web3.utils.padLeft(web3.utils.toHex('ETH-T'), 34),
      18,
      'ethereum.org',
      mockBytes,
      [mockAddress, mockAddress],
      [],
      [],
      deployed.Governance.options.address
    ]);
    // deployed.StakingPriceFeed = await createStakingFeed({...opts}, deployed.CanonicalPriceFeed);
    // await deployed.MlnToken.methods.approve(
    //   deployed.StakingPriceFeed.options.address,
    //   config.protocol.staking.minimumAmount
    // ).send(
    //   {...opts}
    // );
    // await deployed.StakingPriceFeed.methods.depositStake(config.protocol.staking.minimumAmount, web3.utils.asciiToHex("")).send(
    //   {...opts}
    // );
    deployed.SimpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", opts);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);
    deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [154630446100]);
    deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);

    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.CentralizedAdapter = await deployContract("exchange/adapter/CentralizedAdapter", opts);
    deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [accounts[0]]);
    deployed.Version = await deployContract(
      "version/Version",
      opts,
      [
        pkgInfo.version, deployed.Governance.options.address, deployed.MlnToken.options.address,
        deployed.EthToken.options.address, deployed.CanonicalPriceFeed.options.address, deployed.CompetitionCompliance.options.address
      ],
      () => {}, true
    );
    deployed.FundRanking = await deployContract("FundRanking", opts);
    deployed.Competition = await deployContract(
      "competitions/Competition",
      opts,
      [
        deployed.MlnToken.options.address, deployed.Version.options.address,
        accounts[5], blockchainTime, blockchainTime + 8640000,
        20 * 10 ** 18, new BigNumber(10 ** 23), 10
      ]
    );
    await deployed.CompetitionCompliance.methods.changeCompetitionAddress(deployed.Competition.options.address).send(opts);
    await deployed.Competition.methods.batchAddToWhitelist(new BigNumber(10 ** 25), [accounts[0], accounts[1], accounts[2]]).send(opts);

    // whitelist trading pairs
    const pairsToWhitelist = [
      [deployed.MlnToken.options.address, deployed.EthToken.options.address],
      [deployed.EurToken.options.address, deployed.EthToken.options.address],
      [deployed.MlnToken.options.address, deployed.EurToken.options.address],
    ];
    await Promise.all(
      pairsToWhitelist.map(async (pair) => {
        await deployed.MatchingMarket.methods.addTokenPairWhitelist(pair[0], pair[1]).send(opts);
      })
    );

    // add Version to Governance tracking
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.options.address]);

    // whitelist exchange
    await governanceAction(
      opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
      [
        deployed.MatchingMarket.options.address,
        deployed.MatchingMarketAdapter.options.address,
        true,
        [
          makeOrderSignature,
          takeOrderSignature,
          cancelOrderSignature
        ]
      ]
    );

    // register assets
    await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
      deployed.MlnToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('Melon token'), 34),
      web3.utils.padLeft(web3.utils.toHex('MLN-T'), 34),
      18,
      "melonport.com",
      mockBytes,
      [mockAddress, mockAddress],
      [],
      []
    ]);

    await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
      deployed.EurToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('Euro token'), 34),
      web3.utils.padLeft(web3.utils.toHex('EUR-T'), 34),
      18,
      "europa.eu",
      mockBytes,
      [mockAddress, mockAddress],
      [],
      []
    ]);
  }
  // await verifyDeployment(deployed);
  const enhancedDeployed = await setupKyberDevEnv(deployed, accounts, opts);
  return enhancedDeployed;  // return instances of contracts we just deployed
}

// takes `deployed` object as defined above, and environment to write to
async function writeToAddressBook(deployedContracts, environment) {
  let addressBook;
  if (fs.existsSync(addressBookFile)) {
    addressBook = JSON.parse(fs.readFileSync(addressBookFile));
  } else addressBook = {};

  const namesToAddresses = {};
  Object.keys(deployedContracts)
    .forEach(key => {
      namesToAddresses[key] = deployedContracts[key].options.address
    });
  addressBook[environment] = namesToAddresses;

  fs.writeFileSync(
    addressBookFile,
    JSON.stringify(addressBook, null, '  '),
    'utf8'
  );
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify an environment using the environment variable CHAIN_ENV`);
  } else {
    deployEnvironment(environment)
      .then(deployedContracts => writeToAddressBook(deployedContracts, environment))
      .catch(err => console.error(err.stack))
      .finally(() => process.exit())
  }
}

export default deployEnvironment;
