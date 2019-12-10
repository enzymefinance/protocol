const fs = require('fs');
const path = require('path');
const web3 = require('./get-web3');

const outdir = path.resolve(`${__dirname}/../../out`);

const defaultOptions = {
  gas: 10000000,
  gasPrice: 50000000000,
  value: 0,
  data: null,
};

// takes a web3 account object and gets the next nonce
// we manually track the nonce, since remote nodes tend to get out of sync
const getNextNonce = async account => {
  // TODO: re-enable; nonce tracking needed when using infura,
  //    but doesn't seem to work in local testing
  // if (account.nonce === undefined) {
  //   account.nonce = await web3.eth.getTransactionCount(account.address, 'pending');
  // }
  // const nextNonce = account.nonce;
  // account.nonce++;
  return await web3.eth.getTransactionCount(account.address, 'pending');
  // return nextNonce;
}

const stdout = msg => {
  process.env.MLN_VERBOSE && console.log(msg);
}

const call = async (contract, method, args=[], opts) => {
  stdout(
    `Calling ${method} at ${contract.options.address}${
        (args.length) ? ` with args [${args}]` : ''
    }`
  )
  const result = await contract.methods[method](...args).call(opts);
  return result;
}

const send = async (contract, method=undefined, args=[], opts) => {
  stdout(
    `Sending${
        (method) ? ` ${method}` : ''
    } to ${contract.options.address}${
        (args.length) ? ` with args [${args}]` : ''
    }`
  );
  const account = web3.eth.accounts.wallet['0']; // TODO: change so it can be overridden
  const nonce = await getNextNonce(account);
  const clonedDefaults = Object.assign({}, defaultOptions);
  const tx = Object.assign(
    clonedDefaults,
    Object.assign({
      from: account.address,
      nonce: nonce,
      to: contract.options.address
    }, opts)
  );
  if (method) {
    tx.data = await contract.methods[method](...args).encodeABI();
  }
  const receipt = await signAndSend(tx, account.privateKey);
  return receipt;
}

const signAndSend = async (tx, pkey) => {
  const signed = await web3.eth.accounts.signTransaction(tx, pkey);
  const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
  return receipt;
}

// deploy a contract with some args
const deploy = async (name, args=[], overrideOpts={}) => {
  const account = web3.eth.accounts.wallet['0']; // TODO: change so it can be overridden
  const abi = JSON.parse(fs.readFileSync(`${outdir}/${name}.abi`, 'utf8'));
  const bin = fs.readFileSync(`${outdir}/${name}.bin`, 'utf8').trim();
  const contract = new web3.eth.Contract(abi);
  const input = contract.deploy({
    arguments: args,
    data: bin.indexOf('0x') === 0 ? bin : `0x${bin}`
  }).encodeABI();
  const nonce = await getNextNonce(account);
  const clonedDefaults = Object.assign({}, defaultOptions);
  const normalOpts = Object.assign(
    clonedDefaults,
    { data: input, from: account.address, nonce: nonce, to: null }
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
