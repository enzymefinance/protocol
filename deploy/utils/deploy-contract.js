const fs = require('fs');
const path = require('path');
const web3 = require('./get-web3');

const outdir = path.resolve(`${__dirname}/../../out`);

const defaultOptions = {
  gas: web3.utils.toHex(10000000),
  gasPrice: web3.utils.toHex(5000000000),
  value: web3.utils.toHex(0),
  data: null,
};

// takes a web3 account object and gets the next nonce
// we manually track the nonce, since remote nodes tend to get out of sync
const getNextNonce = async account => {
  const nonceFromTxPool = await web3.eth.getTransactionCount(account.address, 'pending');
  if (process.env.LOCAL_CHAIN) {
    return nonceFromTxPool;
  }
  if (account.nonce === undefined) {
    account.nonce = nonceFromTxPool;
  }
  const nextNonce = account.nonce;
  account.nonce++;
  return nextNonce;
}

const stdout = msg => {
  process.env.MLN_VERBOSE && console.log(msg);
}

const call = async (contract, method=undefined, args=[], opts={}) => {
  stdout(
    `Calling ${method} at ${contract.options.address}${
        (args.length) ? ` with args [${args}]` : ''
    }`
  )
  const result = await contract.methods[method](...args).call(opts);
  return result;
}

const send = async (contract, method=undefined, args=[], opts={}) => {
  stdout(
    `Sending${
        (method) ? ` ${method}` : ''
    } to ${contract.options.address}${
        (args.length) ? ` with args [${args}]` : ''
    }`
  );
  let account;
  if (opts.from) {
    account = web3.eth.accounts.wallet[opts.from];
  } else { // default to first account
    account = web3.eth.accounts.wallet['0'];
  }
  const nonce = await getNextNonce(account);
  const clonedDefaults = Object.assign({}, defaultOptions);

  let txFunction;
  if (method) txFunction = contract.methods[method](...args);

  const tx = Object.assign(
    clonedDefaults,
    Object.assign({
      from: account.address,
      nonce: nonce,
      to: contract.options.address
    }, opts)
  );
  if (tx.value) {
    tx.value = web3.utils.toHex(tx.value)
  }
  if (method) {
    tx.data = await txFunction.encodeABI();

    if (!opts.gas) {
      let boostedGasEstimation;
      try {
        const estimatedGas = await txFunction.estimateGas({from: tx.from});
        boostedGasEstimation = web3.utils.toHex(Math.floor(estimatedGas * 2));
      } catch (e) {
        console.error(`Failed during gas estimation:\n ${JSON.stringify(tx, null, '  ')}`);
        throw(e);
      }
      tx.gas = boostedGasEstimation;
    }
  }
  const receipt = await signAndSend(tx, account.privateKey);
  return receipt;
}

const signAndSend = async (tx, pkey) => {
  const signed = await web3.eth.accounts.signTransaction(tx, pkey);
  return web3.eth.sendSignedTransaction(signed.rawTransaction);
}

// TODO: factor out common code between deploy and send
// deploy a contract with some args
const deploy = async (name, args=[], overrideOpts={}) => {
  let account;
  if (overrideOpts.from) {
    account = web3.eth.accounts.wallet[overrideOpts.from];
  } else { // default to first account
    account = web3.eth.accounts.wallet['0'];
  }
  const abi = JSON.parse(fs.readFileSync(`${outdir}/${name}.abi`, 'utf8'));
  const bin = fs.readFileSync(`${outdir}/${name}.bin`, 'utf8').trim();
  const contract = new web3.eth.Contract(abi);
  const txFunction = contract.deploy({
    arguments: args,
    data: bin.indexOf('0x') === 0 ? bin : `0x${bin}`
  });
  const estimatedGas = web3.utils.toHex(
    Math.floor(await txFunction.estimateGas({ from: account.address }) * 1.5)
  );
  const input = await txFunction.encodeABI();
  const nonce = await getNextNonce(account);
  const clonedDefaults = Object.assign({}, defaultOptions);
  const normalOpts = Object.assign(
    clonedDefaults,
    {
      data: input,
      gas: estimatedGas,
      from: account.address,
      nonce: nonce,
      to: null
    }
  );
  const tx = Object.assign(normalOpts, overrideOpts);
  stdout(`Deploying ${name}${(args.length) ? ` with args [${args}]` : '' }`);
  const receipt = await signAndSend(tx, account.privateKey);
  contract.options.address = receipt.contractAddress;
  stdout(`Deployed ${name} at ${contract.options.address}`);
  return contract;
}

// get a contract with some address
const fetchContract = (name, address) => {
  const abi = JSON.parse(fs.readFileSync(`${outdir}/${name}.abi`, 'utf8'));
  stdout(`Fetching ${name} at ${address}`);
  const contract = new web3.eth.Contract(abi, address);
  return contract;
}

// get address from deploy input if we have one
// otherwise deploy it with args
// TODO: better document
const nab = async (name, args, input, explicitKey=null) => {
  let contract;
  const key = explicitKey || name;
  if (input[key] === '' || input[key] === undefined) {
    contract = await deploy(name, args);
  } else {
    contract = fetchContract(name, input[key]);
  }
  return contract;
}

module.exports = { call, send, deploy, fetchContract, nab };
