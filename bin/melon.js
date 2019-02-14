#!/usr/bin/env node
// require('babel-polyfill');
const R = require('ramda');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const program = require('commander');
const pkg = require('../package.json');
const https = require('https');
const {
  createPrice,
  createQuantity,
  createToken,
} = require('@melonproject/token-math');

const checkPeerCount = environment => {
  let lastPeerCount;

  global.setInterval(async () => {
    const currentPeerCount = await environment.eth.net.getPeerCount();

    if (lastPeerCount === undefined && currentPeerCount > 0) {
      lastPeerCount = currentPeerCount;
      console.log('Node has', lastPeerCount, 'peers');
    } else if (lastPeerCount !== 0 && currentPeerCount === 0) {
      lastPeerCount = currentPeerCount;
      console.warn('Node has no peers!');
    } else if (lastPeerCount === 0 && currentPeerCount > 0) {
      lastPeerCount = currentPeerCount;
      console.log('Found some peers:', lastPeerCount);
    }
  }, 5000);
};

const getEnvironment = ({
  pathToKeystore,
  endpoint,
  gasPrice,
  gasLimit,
  privateKey,
  track,
}) =>
  new Promise(async (resolve, reject) => {
    try {
      const {
        constructEnvironment,
      } = require('../lib/utils/environment/constructEnvironment');

      const { cliLogger } = require('../lib/utils/environment/cliLogger');

      const environmentWithoutWallet = constructEnvironment({
        endpoint,
        logger: cliLogger,
        options: {
          gasPrice,
          gasLimit,
        },
        track,
      });

      if (pathToKeystore) {
        console.log('Keystore file at:', pathToKeystore);

        const keystore = JSON.parse(fs.readFileSync(pathToKeystore, 'utf8'));
        const {
          withKeystoreSigner,
        } = require('../lib/utils/environment/withKeystoreSigner');

        if (process.env.KEYSTORE_PASSWORD) {
          console.log('Using KEYSTORE_PASSWORD from env vars');

          const withWallet = withKeystoreSigner(environmentWithoutWallet, {
            keystore,
            password: process.env.KEYSTORE_PASSWORD,
          });

          return resolve(withWallet);
        }

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        rl.question(
          `Please type the password to unlock the keystore: `,
          password => {
            const withWallet = withKeystoreSigner(environmentWithoutWallet, {
              keystore,
              password,
            });
            rl.close();

            resolve(withWallet);
          },
        );
      } else if (privateKey) {
        console.log('With private key');

        const {
          withPrivateKeySigner,
        } = require('../lib/utils/environment/withPrivateKeySigner');

        const withWallet = await withPrivateKeySigner(
          environmentWithoutWallet,
          privateKey,
        );

        resolve(withWallet);
      } else {
        console.log('With unlocked node');

        const {
          withUnlockedSigner,
        } = require('../lib/utils/environment/withUnlockedSigner');

        const withWallet = await withUnlockedSigner(environmentWithoutWallet);
        resolve(withWallet);
      }
    } catch (e) {
      reject(e);
    }
  });

program
  .version(pkg.version, '-v, --version')
  .description('The Melon Protocol CLI');

program
  .command('compile [<glob>]')
  .description('Compile the Melon Smart Contracts.')
  .action(async glob => {
    console.log(glob ? `Compiling ${glob}` : 'Compiling all contracts');

    try {
      const { compileGlob } = require('./compile');
      await compileGlob(glob);
      process.exit();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('deploy')
  .description(
    'Deploy the Melon smart contracts. By default: A full deploy to the local chain at localhost:8545',
  )
  .option(
    '-t, --tokens <tokens>',
    'A comma separated list of tokens to deploy. It always starts with: "WETH,MLN,ZRX". To add decimals, write: "EUR:2"',
  )
  .option(
    '-c, --config <pathToConfig>',
    'Path to JSON config. Example: ./deployments/config/test.json',
  )
  .option(
    '-e, --endpoint <endpoint>',
    'The JSON RPC endpoint url. By default: https://localhost:8545',
  )
  .option('-g, --gas <number>', 'Default number of gas units to provide')
  .option('-p, --gas-price <number>', 'Price (in wei) of each gas unit')
  .option(
    '-k, --keystore <pathToKeystore>',
    'Load the deployer account from a keystore file',
  )
  .option(
    '-P, --private-key <string>',
    'Load the deployer account from a private key',
  )
  .option('-T, --track <string>', 'Specify a track')
  .action(async options => {
    console.log(`Deploying thirdParty & melon contracts.`);
    const providedTokens = options.tokens ? options.tokens.split(',') : [];
    const tokens = ['WETH', 'MLN', 'ZRX', 'EUR', 'DGX', ...providedTokens];
    const tokenInterfaces = tokens.map(token => {
      const [symbol, decimals] = token.split(':');
      return createToken(symbol, undefined, decimals && parseInt(decimals, 10));
    });

    const config = options.config && require(`../${options.config}`);

    if (config) console.log('Loaded config from', `../${options.config}`);

    const {
      deployThirdParty,
    } = require('../lib/utils/deploy/deployThirdParty');
    const {
      deploySystem,
      deployAllContractsConfig,
      detfaultControlConfig,
    } = require('../lib/utils/deploy/deploySystem');

    try {
      const environment = await getEnvironment({
        endpoint:
          options.endpoint ||
          process.env.JSON_RPC_ENDPOINT ||
          'http://localhost:8545',
        gasLimit: options.gas || '8000000',
        gasPrice: options.gasPrice || '2000000000',
        pathToKeystore: options.keystore || undefined,
        privateKey: options.privateKey || undefined,
        track: options.track || R.path(['meta', 'track'], config),
      });

      checkPeerCount(environment);

      const thirdPartyContracts =
        (config && config.thirdPartyContracts) ||
        (await deployThirdParty(environment, tokenInterfaces));

      const { deployment } = await deploySystem(
        environment,
        thirdPartyContracts,
        (config && config.melonContracts) || deployAllContractsConfig,
        (config && config.control) || defaultControlConfig,
        R.path(['meta', 'description'], config),
      );
      const chainId = await environment.eth.net.getId();

      const chainMap = {
        1: 'mainnet',
        42: 'kovan',
      };

      const chainName = chainMap[chainId] || 'development';

      fs.writeFileSync(
        `./deployments/${chainName}-${environment.track}.json`,
        JSON.stringify(deployment, null, 2),
      );
      process.exit();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('set-price <symbol> <value>')
  .description('Sets a price on the price feed.')
  .option(
    '-e, --endpoint <endpoint>',
    'The JSON RPC endpoint url. By default: https://localhost:8545',
  )
  .option('-g, --gas <number>', 'Default number of gas units to provide')
  .option('-p, --gas-price <number>', 'Price (in wei) of each gas unit')
  .option(
    '-k, --keystore <pathToKeystore>',
    'Load the deployer account from a keystore file',
  )
  .option(
    '-P, --private-key <string>',
    'Load the deployer account from a private key',
  )
  .option('-T, --track <string>', 'Specify a track')
  .action(async (symbol, value, options) => {
    console.log(`Setting the price for ${symbol} to ${value}`);
    const {
      initTestEnvironment,
    } = require('../lib/tests/utils/initTestEnvironment');
    const { update } = require('../lib/contracts/prices/transactions/update');
    const {
      getQuoteToken,
    } = require('../lib/contracts/prices/calls/getQuoteToken');

    try {
      const environmentWithoutDeployment = await getEnvironment({
        endpoint:
          options.endpoint ||
          process.env.JSON_RPC_ENDPOINT ||
          'http://localhost:8545',
        gasLimit: options.gas || '8000000',
        gasPrice: options.gasPrice || '2000000000',
        pathToKeystore: options.keystore || undefined,
        privateKey: options.privateKey || undefined,
        track: options.track,
      });

      checkPeerCount(environmentWithoutDeployment);

      const {
        withDeployment,
      } = require('../lib/utils/environment/withDeployment');
      const environment = await withDeployment(environmentWithoutDeployment);

      const { priceSource } = environment.deployment.melonContracts;
      const { tokens } = environment.deployment.thirdPartyContracts;

      const quoteToken = await getQuoteToken(environment, priceSource);
      const baseToken = tokens.find(token => {
        return token.symbol === symbol.toUpperCase();
      });

      const newPrice = createPrice(
        createQuantity(baseToken, 1),
        createQuantity(quoteToken, value),
      );

      await update(environment, priceSource, [newPrice]);

      console.log(`Successfully updated the price for ${symbol}.`);
      process.exit();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('update-kyber-pricefeed')
  .description('Update kyber pricefeed')
  .option(
    '-e, --endpoint <endpoint>',
    'The JSON RPC endpoint url. By default: https://localhost:8545',
  )
  .option('-g, --gas <number>', 'Default number of gas units to provide')
  .option('-p, --gas-price <number>', 'Price (in wei) of each gas unit')
  .option(
    '-k, --keystore <pathToKeystore>',
    'Load the deployer account from a keystore file',
  )
  .option(
    '-P, --private-key <string>',
    'Load the deployer account from a private key',
  )
  .option('-T, --track <string>', 'Specify a track')
  .option('-I, --interval <number>', 'Gap between each pricefeed update in ms')

  .action(async options => {
    console.log(`Started Kyber Pricefeed updater`);
    try {
      const environmentWithoutDeployment = await getEnvironment({
        endpoint:
          options.endpoint ||
          process.env.JSON_RPC_ENDPOINT ||
          'http://localhost:8545',
        gasLimit: options.gas || '8000000',
        gasPrice: options.gasPrice || '2000000000',
        pathToKeystore: options.keystore || undefined,
        privateKey: options.privateKey || undefined,
        track: options.track,
      });

      checkPeerCount(environmentWithoutDeployment);

      const {
        withDeployment,
      } = require('../lib/utils/environment/withDeployment');
      const environment = await withDeployment(environmentWithoutDeployment);

      const {
        updateKyber,
      } = require('../lib/contracts/prices/transactions/updateKyber');

      const updatePeriodically = async () => {
        try {
          await updateKyber(
            environment,
            environment.deployment.melonContracts.priceSource,
          );
        } catch (err) {
          console.error(err);
        }
      };

      setInterval(updatePeriodically, options.interval);
      
      // Run it once immediately.
      updatePeriodically();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('get-reserve-quantity <tokenSymbol>')
  .description('Get a reasonable reserve quantity level for a token')
  .option(
    '-k, --keyfile <pathToApiKey>',
    'File containing the API key',
  )
  .action(async (tokenSymbol, options) => {
    try {
      if(!fs.existsSync(options.keyfile)) {
        throw new Error(`File does not exist at ${options.keyfile}`);
      }
      const apiKey = fs.readFileSync(options.keyfile, 'utf8').trim();

      const tokenInfoMainnet = JSON.parse(
        fs.readFileSync('./deployments/mainnet-kyberPrice.json')
      ).thirdPartyContracts.tokens;
      const allDecimalInfo = tokenInfoMainnet.map(e => {
        return {symbol: e.symbol, decimals: e.decimals}
      });

      tokenDecimalInfo = allDecimalInfo.find(e => e.symbol === tokenSymbol);
      if (tokenDecimalInfo === undefined) {
        throw new Error(`No token with symbol ${tokenSymbol}`);
      }

      const decimals = tokenDecimalInfo.decimals;

      var options = {
        'method': 'GET',
        'hostname': 'rest.coinapi.io',
        'path': `/v1/exchangerate/ETH/${tokenSymbol}`,
        'headers': {'X-CoinAPI-Key': apiKey}
      };
      const req = https.request(options, (res) => {
        let json = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => json += chunk); 
        res.on('end', () => {
          if (res.statusCode === 200) {
            const parsedResult = JSON.parse(json);
            const price = parsedResult.rate;
            const minimumReserve = `${price * 10 ** decimals}`;
            if (minimumReserve.indexOf('e+') !== -1) {
              const components = minimumReserve.split('e+');
              let expanded = components[0].replace('.', '');
              expanded = expanded.padEnd(
                Number(components[1]) + 1, '0'
              );
              console.log(expanded);
            } else {
              console.log(`${Math.round(minimumReserve)}`);
            }
            process.exit(0);
          } else {
            throw new Error(`Request status: ${res.statusCode}`);
          }
        });
      });
      req.end();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  })


program.on('command:*', function() {
  program.help();
  process.exit();
});

if (process.argv.length < 3) {
  program.help();
  process.exit();
}

program.parse(process.argv);
