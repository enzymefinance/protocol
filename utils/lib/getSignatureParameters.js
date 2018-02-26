import api from "./api";

// convenience functions

// input manager's address
export default async function getSignatureParameters(managerAddress) {
  const hash = "0xAA9C907B0D6B4890E7225C09CBC16A01CB97288840201AA7CDCB27F4ED7BF159";
  let sig = await api.eth.sign(managerAddress, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseInt(sig.substr(128, 2), 16);
  return [r, s, v];
}
