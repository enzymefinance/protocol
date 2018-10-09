/**
 * Tracks describe different deployment tracks. They are
 * independent of networks. I.e. the competition track can
 * be on kovan, on mainnet or on local test net.
 */
const tracks = {
  // Competition track with investing through competition contract
  COMPETITION: 'competition',

  // Demo track that has everything enabled
  DEMO: 'demo',

  // TODO: Live track that is actually narrowed down and secured
  // LIVE: 'live',
};

export default tracks;
