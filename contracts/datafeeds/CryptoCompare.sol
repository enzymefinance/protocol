pragma solidity ^0.4.8;

import "../datafeeds/PriceFeedProtocol.sol";
import "../dependencies/DBC.sol";
import "../assets/Asset.sol";
import "../dependencies/ERC20.sol";
import "../dependencies/Owned.sol";
import "../dependencies/usingOraclize.sol";
import "../dependencies/DateTime.sol";
import "../dependencies/JSON_Decoder.sol";
import "../dependencies/b64.sol";
import "../dependencies/ECVerify.sol";
import "../dependencies/strings.sol";


/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts

contract CryptoCompare is DBC, Owned, usingOraclize, ECVerify, b64, JSON_Decoder , PriceFeedProtocol{
    using strings for *;
    DateTime time = DateTime(0xe586cc86e5dfcf6e0578ea0dfcc0fcbe98ca988b);

    // TYPES

    struct Data {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset quoted against `quoteAsset` times ten to the power of {decimals of this asset}
    }

    struct AssetInfo {
        address assetAddress;
        string assetTicker;
    }

    // FIELDS

    address public constant ETHER_TOKEN = 0xfa8513D63417503e73B3EF13bD667130Fc6025F3;
    address public constant BITCOIN_TOKEN = 0xAb264ab27E26e30bbcae342A82547CC4fFc2d63B;

    address quoteAsset; // Is the quote asset of a portfolio against which all other assets are priced against
    uint frequency = 30; // Frequency of updates in seconds
    uint validity = 600; // Time in seconds data is considered valid
    uint gasLimit = 500000;
    bytes ds_pubkey;

    mapping (address => Data) data; // Address of fungible => price of fungible

    // EVENTS
    event PriceUpdated(address indexed ofAsset, uint atTimestamp, uint ofPrice);

    // ORACLIZE DATA-STRUCTURES
    bool continuousDelivery;
    string oraclizeQuery;

    // MODIFIERS
    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    modifier data_initialised(address ofAsset) {
        assert(data[ofAsset].timestamp > 0);
        _;
    }

    modifier data_still_valid(address ofAsset) {
        assert(now - data[ofAsset].timestamp <= validity);
        _;
    }

    modifier arrays_equal(address[] x, uint[] y) {
        assert(x.length == y.length);
        _;
    }

    modifier only_oraclize {
        if (msg.sender != oraclize_cbAddress()) throw;
        _;
    }

    // CONSTANT METHODS
    function getQuoteAsset() constant returns (address) { return quoteAsset; }
    function getFrequency() constant returns (uint) { return frequency; }
    function getValidity() constant returns (uint) { return validity; }

    // Pre: Asset has been initialised
    // Post: Returns boolean if data is valid
    function getStatus(address ofAsset)
        constant
        data_initialised(ofAsset)
        returns (bool)
    {
        return now - data[ofAsset].timestamp <= validity;
    }

    // Pre: Checks for initialisation and inactivity
    // Post: Price of asset, where last updated not longer than `validity` seconds ago
    function getPrice(address ofAsset)
        constant
        data_initialised(ofAsset)
        data_still_valid(ofAsset)
        returns (uint)
    {
        return data[ofAsset].price;
    }

    // Pre: Checks for initialisation and inactivity
    // Post: Timestamp and price of asset, where last updated not longer than `validity` seconds ago
    function getData(address ofAsset)
        constant
        data_initialised(ofAsset)
        data_still_valid(ofAsset)
        returns (uint, uint)
    {
        return (data[ofAsset].timestamp, data[ofAsset].price);
    }

    function getPublicKey()
        constant
        returns (bytes)
    {
        return ds_pubkey;
    }

    AssetInfo[] public assets;
    /*AssetInfo[10] public assets; // TODO: move to top when hardcoding (below) fixed*/
    /*AssetInfo[1] storage assets = [AssetInfo(0xbbfbd7113dd4634cc42391a3fdb65ba7fdeaa55c, "ANT")];*/
    /*uint[] public nn;*/
    function CryptoCompare(address quote, address[] bases){
        // even this below gives out of gas error
        /*nn.push(22);*/
        // TODO: remove hardcoding; make this dynamic
        /*assets[0] = AssetInfo(0xbbfbd7113dd4634cc42391a3fdb65ba7fdeaa55c, "ANT");*/
        // below causes an "out of gas" error
        /*for (uint ii = 0; ii < 3; ii++) {
            assets.push(AssetInfo(bases[ii], "abc"));
        }*/
    }

    function ignite() payable {
        oraclize_setProof(240);
        /* Note:
         *  Sample response for below query {"MLN":1.36,"BTC":0.04695,"EUR":47.48,"REP":4.22}
         *  Prices shold be quoted in quoteAsset
         *  1) MLN/ETH -> ETH/MLN
         *  2) BTC/ETH -> ETH/BTC
         *  3) EUR/ETH -> ETH/EUR
         *  4) REP/ETH -> ETH/REP
         */
        setQuery("https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=MLN,BTC,EUR,REP&sign=true");
        ds_pubkey = hex"a0f4f688350018ad1b9785991c0bde5f704b005dc79972b114dbed4a615a983710bfc647ebe5a320daa28771dce6a2d104f5efa2e4a85ba3760b76d46f8571ca";
        enableContinuousDelivery();
        oraclize_query('URL', oraclizeQuery, 500000);
    }

    function () payable {}

    /* The native proof is considered valid if the HTTP Date Header has a timestamp
    *  subsequent to the timestamp of execution of the last Oraclize callback,
    *  which is the time when the price data was updated.
    *  This check prevents Oraclize from doing replay attacks on the signed data.
    */
    function isFresh(string _dateHeader) internal constant returns(bool) {
        uint timestamp = time.parseDate(_dateHeader);
        if (timestamp > data[BITCOIN_TOKEN].timestamp) {
            return true;
        }
        return false;
    }

    function nativeProof_verify(string result, bytes proof, bytes pubkey) private returns (bool) {
        uint sig_len = uint(proof[1]);
        bytes memory sig = new bytes(sig_len);
        sig = copyBytes(proof, 2, sig_len, sig, 0);
        uint headers_len = uint(proof[2+sig_len])*256 + uint(proof[2+sig_len+1]);
        bytes memory headers = new bytes(headers_len);
        headers = copyBytes(proof, 4+sig_len, headers_len, headers, 0);
        bytes memory dateHeader = new bytes(30);
        dateHeader = copyBytes(headers, 5, 30, dateHeader, 0);
        bytes memory digest = new bytes(headers_len-52); //len("digest: SHA-256=")=16
        digest = copyBytes(headers, 52, headers_len-52, digest, 0);
        //Freshness
        bool dateok = isFresh(string(dateHeader));
        if (!dateok) return false;
        //Integrity
        bool digestok = (sha3(sha256(result)) == sha3(b64decode(digest)));
        if (!digestok) return false;
        //Authenticity
        bool sigok;
        address signer;
        (sigok, signer) = ecrecovery(sha256(headers), sig);
        return (signer == address(sha3(pubkey)));
    }

    function copyBytes(bytes from, uint fromOffset, uint length, bytes to, uint toOffset) internal returns (bytes) {
        uint minLength = length + toOffset;

        if (to.length < minLength) {
            // Buffer too small
            throw; // Should be a better way?
        }

        // NOTE: the offset 32 is added to skip the `size` field of both bytes variables
        uint i = 32 + fromOffset;
        uint j = 32 + toOffset;

        while (i < (32 + fromOffset + length)) {
            assembly {
                let tmp := mload(add(from, i))
                mstore(add(to, j), tmp)
            }
            i += 32;
            j += 32;
        }

        return to;
    }


    function __callback(bytes32 oraclizeId, string result, bytes proof) only_oraclize {
        // Update prices only if native proof is verified
        if ((proof.length > 0) && (nativeProof_verify(result, proof, ds_pubkey))) {
            for (uint i=0; i < assets.length; i++) {
                AssetInfo thisAsset = assets[i];
                setPriceOf(result, thisAsset.assetTicker, thisAsset.assetAddress);
            }
        }

        if (continuousDelivery) {
           updatePriceOraclize();
        }
    }

    function setPriceOf(string result, string ticker, address assetAddress) internal {
        Asset currentAsset = Asset(assetAddress);
        Asset baseAsset = Asset(quoteAsset);
        uint price = (10**currentAsset.getDecimals() * 10**baseAsset.getDecimals())/parseInt(JSONpath_string(result, ticker), currentAsset.getDecimals());
        data[assetAddress] = Data(now, price);
        PriceUpdated(assetAddress, now, price);
    }

    function setQuery(string query) pre_cond(isOwner()) { oraclizeQuery = query; }
    function updateKey(bytes _pubkey) pre_cond(isOwner()) { ds_pubkey = _pubkey; }
    function enableContinuousDelivery() pre_cond(isOwner()) { continuousDelivery = true; }
    function disableContinuousDelivery() pre_cond(isOwner()) { delete continuousDelivery; }
    function setGasLimit(uint _newGasLimit) pre_cond(isOwner()) { gasLimit = _newGasLimit; }
    function updatePriceOraclize() payable { bytes32 oraclizeId = oraclize_query(frequency,'URL', oraclizeQuery, gasLimit); }
    function setValidity(uint _validity) pre_cond(isOwner()) { validity = _validity; }
}
