import web3 from "./web3";

async function getSignature(signer, contents) {
  return web3.eth.sign(contents, signer);
}

async function getSignatureParameters(signer, contents) {
  let sig = await getSignature(signer, contents);
  sig = sig.substr(2,);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseInt(sig.substr(128, 2), 16) + 27;
  return [r, s, v];
}

async function getTermsSignatureParameters(managerAddress) {
  const termsAndConditionsHash =
    "0xAA9C907B0D6B4890E7225C09CBC16A01CB97288840201AA7CDCB27F4ED7BF159";
  return getSignatureParameters(managerAddress, termsAndConditionsHash);
}

export { 
  getSignature,
  getSignatureParameters,
  getTermsSignatureParameters
}
