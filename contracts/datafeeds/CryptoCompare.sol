pragma solidity ^0.4.8;

import "../datafeeds/PriceFeedProtocol.sol";
import "../dependencies/DBC.sol";
import "../assets/Asset.sol";
import "../dependencies/ERC20.sol";
import "../dependencies/Owned.sol";
import "../dependencies/oraclizeAPI_0.4.sol";
import "../dependencies/strings.sol";


/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
contract DateTime {
        using strings for *;
        event Log(uint n);
        /*
         *  Date and Time utilities for ethereum contracts
         *
         */
        struct DateTime {
                uint16 year;
                uint8 month;
                uint8 day;
                uint8 hour;
                uint8 minute;
                uint8 second;
                uint8 weekday;
        }

        uint constant DAY_IN_SECONDS = 86400;
        uint constant YEAR_IN_SECONDS = 31536000;
        uint constant LEAP_YEAR_IN_SECONDS = 31622400;

        uint constant HOUR_IN_SECONDS = 3600;
        uint constant MINUTE_IN_SECONDS = 60;

        uint16 constant ORIGIN_YEAR = 1970;

        function isLeapYear(uint16 year) constant returns (bool) {
                if (year % 4 != 0) {
                        return false;
                }
                if (year % 100 != 0) {
                        return true;
                }
                if (year % 400 != 0) {
                        return false;
                }
                return true;
        }

        function leapYearsBefore(uint year) constant returns (uint) {
                year -= 1;
                return year / 4 - year / 100 + year / 400;
        }

        function getDaysInMonth(uint8 month, uint16 year) constant returns (uint8) {
                if (month == 1 || month == 3 || month == 5 || month == 7 || month == 8 || month == 10 || month == 12) {
                        return 31;
                }
                else if (month == 4 || month == 6 || month == 9 || month == 11) {
                        return 30;
                }
                else if (isLeapYear(year)) {
                        return 29;
                }
                else {
                        return 28;
                }
        }

        function parseTimestamp(uint timestamp) internal returns (DateTime dt) {
                uint secondsAccountedFor = 0;
                uint buf;
                uint8 i;

                // Year
                dt.year = getYear(timestamp);
                buf = leapYearsBefore(dt.year) - leapYearsBefore(ORIGIN_YEAR);

                secondsAccountedFor += LEAP_YEAR_IN_SECONDS * buf;
                secondsAccountedFor += YEAR_IN_SECONDS * (dt.year - ORIGIN_YEAR - buf);

                // Month
                uint secondsInMonth;
                for (i = 1; i <= 12; i++) {
                        secondsInMonth = DAY_IN_SECONDS * getDaysInMonth(i, dt.year);
                        if (secondsInMonth + secondsAccountedFor > timestamp) {
                                dt.month = i;
                                break;
                        }
                        secondsAccountedFor += secondsInMonth;
                }

                // Day
                for (i = 1; i <= getDaysInMonth(dt.month, dt.year); i++) {
                        if (DAY_IN_SECONDS + secondsAccountedFor > timestamp) {
                                dt.day = i;
                                break;
                        }
                        secondsAccountedFor += DAY_IN_SECONDS;
                }

                // Hour
                dt.hour = getHour(timestamp);

                // Minute
                dt.minute = getMinute(timestamp);

                // Second
                dt.second = getSecond(timestamp);

                // Day of week.
                dt.weekday = getWeekday(timestamp);
        }

        function getYear(uint timestamp) constant returns (uint16) {
                uint secondsAccountedFor = 0;
                uint16 year;
                uint numLeapYears;

                // Year
                year = uint16(ORIGIN_YEAR + timestamp / YEAR_IN_SECONDS);
                numLeapYears = leapYearsBefore(year) - leapYearsBefore(ORIGIN_YEAR);

                secondsAccountedFor += LEAP_YEAR_IN_SECONDS * numLeapYears;
                secondsAccountedFor += YEAR_IN_SECONDS * (year - ORIGIN_YEAR - numLeapYears);

                while (secondsAccountedFor > timestamp) {
                        if (isLeapYear(uint16(year - 1))) {
                                secondsAccountedFor -= LEAP_YEAR_IN_SECONDS;
                        }
                        else {
                                secondsAccountedFor -= YEAR_IN_SECONDS;
                        }
                        year -= 1;
                }
                return year;
        }

        function getMonth(uint timestamp) constant returns (uint8) {
                return parseTimestamp(timestamp).month;
        }

        function getDay(uint timestamp) constant returns (uint8) {
                return parseTimestamp(timestamp).day;
        }

        function getHour(uint timestamp) constant returns (uint8) {
                return uint8((timestamp / 60 / 60) % 24);
        }

        function getMinute(uint timestamp) constant returns (uint8) {
                return uint8((timestamp / 60) % 60);
        }

        function getSecond(uint timestamp) constant returns (uint8) {
                return uint8(timestamp % 60);
        }

        function getWeekday(uint timestamp) constant returns (uint8) {
                return uint8((timestamp / DAY_IN_SECONDS + 4) % 7);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day) constant returns (uint timestamp) {
                return toTimestamp(year, month, day, 0, 0, 0);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day, uint8 hour) constant returns (uint timestamp) {
                return toTimestamp(year, month, day, hour, 0, 0);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day, uint8 hour, uint8 minute) constant returns (uint timestamp) {
                return toTimestamp(year, month, day, hour, minute, 0);
        }

        function toTimestamp(uint16 year, uint8 month, uint8 day, uint8 hour, uint8 minute, uint8 second) constant returns (uint timestamp) {
                uint16 i;

                // Year
                for (i = ORIGIN_YEAR; i < year; i++) {
                        if (isLeapYear(i)) {
                                timestamp += LEAP_YEAR_IN_SECONDS;
                        }
                        else {
                                timestamp += YEAR_IN_SECONDS;
                        }
                }

                // Month
                uint8[12] memory monthDayCounts;
                monthDayCounts[0] = 31;
                if (isLeapYear(year)) {
                        monthDayCounts[1] = 29;
                }
                else {
                        monthDayCounts[1] = 28;
                }
                monthDayCounts[2] = 31;
                monthDayCounts[3] = 30;
                monthDayCounts[4] = 31;
                monthDayCounts[5] = 30;
                monthDayCounts[6] = 31;
                monthDayCounts[7] = 31;
                monthDayCounts[8] = 30;
                monthDayCounts[9] = 31;
                monthDayCounts[10] = 30;
                monthDayCounts[11] = 31;

                for (i = 1; i < month; i++) {
                        timestamp += DAY_IN_SECONDS * monthDayCounts[i - 1];
                }

                // Day
                timestamp += DAY_IN_SECONDS * (day - 1);

                // Hour
                timestamp += HOUR_IN_SECONDS * (hour);

                // Minute
                timestamp += MINUTE_IN_SECONDS * (minute);

                // Second
                timestamp += second;

                return timestamp;
        }

        function toMonth(string _month) constant returns(uint8) {
            if (sha3("Jan") == sha3(_month)) {
                return 1;
            }
            if (sha3("Feb") == sha3(_month)) {
                return 2;
            }
            if (sha3("Mar") == sha3(_month)) {
                return 3;
            }
            if (sha3("Apr") == sha3(_month)) {
                return 4;
            }
            if (sha3("May") == sha3(_month)) {
                return 5;
            }
            if (sha3("Jun") == sha3(_month)) {
                return 6;
            }
            if (sha3("Jul") == sha3(_month)) {
                return 7;
            }
            if (sha3("Aug") == sha3(_month)) {
                return 8;
            }
            if (sha3("Sep") == sha3(_month)) {
                return 9;
            }
            if (sha3("Oct") == sha3(_month)) {
                return 10;
            }
            if (sha3("Nov") == sha3(_month)) {
                return 11;
            }
            if (sha3("Dec") == sha3(_month)) {
                return 12;
            }
        }

        function parseInt(string _a, uint _b) internal returns (uint) {
            bytes memory bresult = bytes(_a);
            uint mint = 0;
            bool decimals = false;
            for (uint i=0; i<bresult.length; i++){
                if ((bresult[i] >= 48)&&(bresult[i] <= 57)){
                    if (decimals){
                       if (_b == 0) break;
                        else _b--;
                    }
                    mint *= 10;
                    mint += uint(bresult[i]) - 48;
                } else if (bresult[i] == 46) decimals = true;
            }
            if (_b > 0) mint *= 10**_b;
            return mint;
        }

        // Parse Date in IMF-fixdate format
        // Tue, 04 Apr 2017 11:12:58 GMT
        function parseDate(string _date) constant returns(uint) {
            var s = _date.toSlice();
            var delim = " ".toSlice();
            var timeDelim = ":".toSlice();
            //Cut out week day
            s.split(",".toSlice());
            //Cut out first space
            s.split(delim);
            // Get day
            uint8 day = uint8(parseInt(s.split(delim).toString(),0));
            uint8 month = toMonth(s.split(delim).toString());
            uint16 year = uint16(parseInt(s.split(delim).toString(), 0));
            uint8 hour = uint8(parseInt(s.split(timeDelim).toString(),0));
            uint8 minute = uint8(parseInt(s.split(timeDelim).toString(),0));
            uint8 second = uint8(parseInt(s.split(timeDelim).toString(),0));
            return toTimestamp(year, month, day, hour, minute, second);
        }
}


contract JSON_Decoder {
  using strings for *;

  function JSONpath_raw(string _json, string _path) constant returns(string) {
    uint depth;

    var s = _json.toSlice();
    var argSliced = _path.toSlice();

    (argSliced, s, depth) = nestedPath(argSliced, s);

    var key = makeKey(argSliced);

    if (s.contains(key)) {
      var pre = s.split(key);
      depth += depthCheck(pre);

      return getElement(s, depth);
    } else {
      //Assumes if the key above was not found
      //that key is in fact an array index
      //may fail if a key uses a numerical value
      //if becomes issue, could use ...data.[0] or the like

      uint x = parseInt(key.toString(), 0);

      if (s.startsWith(' ['.toSlice()) || s.startsWith('['.toSlice())) {
        //remove opening/closing array brackets
        s = s.split(']'.toSlice());
        s = s.rsplit('['.toSlice());

        //split into string array
        var delim = ",".toSlice();

        //handles single-element array
        if (s.count(delim) == 0 && x == 0)
          return s.toString();

        //handle multi-element array
        var parts = new string[](s.count(delim) + 1);

        for (uint i = 0; i < parts.length; i++) {
          parts[i] = s.split(delim).toString();
        }
      }
      return parts[x];
    }
  }

  // strips any double quotes, escaped quotes must be handled manually
  function JSONpath_string(string _json, string _path) constant returns(string _r) {
    _r = JSONpath_raw(_json, _path);

    var s = _r.toSlice();
    var delim = '"'.toSlice();

    if (s.contains(delim)) {
      var parts = new strings.slice[](s.count(delim));
      var resultSlice = ''.toSlice();
      for (uint i = 0; i < parts.length; i++) {
          parts[i] = s.split(delim);
      }

      return ''.toSlice().join(parts);
    }

  }

  function JSONpath_int(string _json, string _path, uint _decimals) constant returns(uint) {
      return parseInt(JSONpath_string(_json, _path), _decimals);
  }

  function nestedPath(strings.slice _path, strings.slice _s)
  private
  returns(strings.slice, strings.slice, uint) {

    var delim = '.'.toSlice();
    uint depth = 0;

    while (_path.contains(delim)) {
      var a = _path.split(delim);
      var pre = _s.split(makeKey(a));

      depthCheck(pre);
      depth++;
    }
    return (_path, _s, depth);
  }

  function makeKey(strings.slice _key)
  private
  returns(strings.slice) {

    _key = '"'.toSlice().concat(_key).toSlice();

    return _key.concat('":'.toSlice()).toSlice();
  }

  function getElement(strings.slice _s, uint _depth)
  private
  returns(string) {

    var endCurlySlice = '}'.toSlice();
    var spaceSlice = ' '.toSlice();
    var quoteSlice = '"'.toSlice();

    //may be unneeded with latest revision
    while (_depth > 0) {
      _s.rsplit(endCurlySlice);
      _depth--;
    }

    //pre-format by taking out extra spaces if applicable
    while (_s.startsWith(spaceSlice))
      _s.split(spaceSlice);

    if (_s.startsWith(quoteSlice)) {
      //return "true";
      _s.split(quoteSlice);
      _s = _s.split(quoteSlice);
    } else if (_s.startsWith('['.toSlice())) {
      //For keys with array value
      var endSquareSlice = ']'.toSlice();

      _s = _s.split(endSquareSlice);
      _s = _s.concat(endSquareSlice).toSlice();
    } else if (_s.startsWith('{'.toSlice())) {
      //For keys referencing objects

      //Could potentially fix duplicate issue on
      //initial conditional if they arise
      //but would make more expensive

      var parts = new string[](_s.count(endCurlySlice) + 1);
      for (uint i = 0; i < parts.length; i++) {
        parts[i] = _s.split(endCurlySlice).concat(endCurlySlice);
      }

      _s = parts[0].toSlice();
      i = 0;

      while (_s.count(endCurlySlice) != _s.count('{'.toSlice()) && i < parts.length) {
        i++;
        _s = _s.concat(parts[i].toSlice()).toSlice();
      }

    } else {
      //For other cases, namely just a number/int
      _s = _s.split(','.toSlice());
      _s = _s.split(endCurlySlice);
    }

    return _s.toString();
  }

  //ensures depth is in proper increments
  function depthCheck(strings.slice _pre)
  private
  returns(uint depth) {
    depth = _pre.count('{'.toSlice());
    if (depth != _pre.count('}'.toSlice()) + 1)
      throw;

    depth = 1;
  }

  /* Copyright (C) 2016 Thomas Bertani - Oraclize */
  function parseInt(string _a, uint _b) internal returns(uint) {
    bytes memory bresult = bytes(_a);
    uint mint = 0;
    bool decimals = false;
    for (uint i = 0; i < bresult.length; i++) {
      if ((bresult[i] >= 48) && (bresult[i] <= 57)) {
        if (decimals) {
          if (_b == 0) break;
          else _b--;
        }
        mint *= 10;
        mint += uint(bresult[i]) - 48;
      } else if (bresult[i] == 46) decimals = true;
    }
    if (_b > 0) mint *= 10**_b;
    return mint;
  }
}

contract b64 {

    function b64decode(bytes s) internal returns (bytes) {
        byte v1;
        byte v2;
        byte v3;
        byte v4;

        //bytes memory s = bytes(_s);
        uint length = s.length;
        bytes memory result = new bytes(length);

        uint index;

        bytes memory BASE64_DECODE_CHAR = hex"000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e003e003f3435363738393a3b3c3d00000000000000000102030405060708090a0b0c0d0e0f10111213141516171819000000003f001a1b1c1d1e1f202122232425262728292a2b2c2d2e2f30313233";
        //MAP[chr]
        if (sha3(s[length - 2]) == sha3('=')) {
            length -= 2;
        } else if (sha3(s[length - 1]) == sha3('=')) {
            length -= 1;
        }

        uint count = length >> 2 << 2;

        for (uint i = 0; i < count;) {
            v1 = BASE64_DECODE_CHAR[uint(s[i++])];
            v2 = BASE64_DECODE_CHAR[uint(s[i++])];
            v3 = BASE64_DECODE_CHAR[uint(s[i++])];
            v4 = BASE64_DECODE_CHAR[uint(s[i++])];


            result[index++] = (v1 << 2 | v2 >> 4) & 255;
            result[index++] = (v2 << 4 | v3 >> 2) & 255;
            result[index++] = (v3 << 6 | v4) & 255;
        }

       if (length - count == 2) {
            v1 = BASE64_DECODE_CHAR[uint(s[i++])];
            v2 = BASE64_DECODE_CHAR[uint(s[i++])];
            result[index++] = (v1 << 2 | v2 >> 4) & 255;
        }
        else if (length - count == 3) {
            v1 = BASE64_DECODE_CHAR[uint(s[i++])];
            v2 = BASE64_DECODE_CHAR[uint(s[i++])];
            v3 = BASE64_DECODE_CHAR[uint(s[i++])];

            result[index++] = (v1 << 2 | v2 >> 4) & 255;
            result[index++] = (v2 << 4 | v3 >> 2) & 255;
        }

        // set to correct length
        assembly {
            mstore(result, index)
        }

        //debug(result);
        //res = result;
        return result;
    }
}

contract ECVerify {
    // Duplicate Solidity's ecrecover, but catching the CALL return value
    function safer_ecrecover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) internal returns (bool, address) {
        // We do our own memory management here. Solidity uses memory offset
        // 0x40 to store the current end of memory. We write past it (as
        // writes are memory extensions), but don't update the offset so
        // Solidity will reuse it. The memory used here is only needed for
        // this context.

        // FIXME: inline assembly can't access return values
        bool ret;
        address addr;

        assembly {
            let size := mload(0x40)
            mstore(size, hash)
            mstore(add(size, 32), v)
            mstore(add(size, 64), r)
            mstore(add(size, 96), s)

            // NOTE: we can reuse the request memory because we deal with
            //       the return code
            ret := call(3000, 1, 0, size, 128, size, 32)
            addr := mload(size)
        }

        return (ret, addr);
    }

    function ecrecovery(bytes32 hash, bytes sig) internal returns (bool, address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        if (sig.length != 65)
          return (false, 0);

        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))

            // Here we are loading the last 32 bytes. We exploit the fact that
            // 'mload' will pad with zeroes if we overread.
            // There is no 'mload8' to do this, but that would be nicer.
            v := byte(0, mload(add(sig, 96)))

            // Alternative solution:
            // 'byte' is not working due to the Solidity parser, so lets
            // use the second best option, 'and'
            // v := and(mload(add(sig, 65)), 255)
        }

        // albeit non-transactional signatures are not specified by the YP, one would expect it
        // to match the YP range of [27, 28]
        //
        // geth uses [0, 1] and some clients have followed. This might change, see:
        //  https://github.com/ethereum/go-ethereum/issues/2053
        if (v < 27)
          v += 27;

        if (v != 27 && v != 28)
            return (false, 0);

        return safer_ecrecover(hash, v, r, s);
    }

}

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

    // Constant fields
    // Token addresses on Kovan
    address public constant ETHER_TOKEN = 0xfa8513D63417503e73B3EF13bD667130Fc6025F3;
    address public constant MELON_TOKEN = 0x16ff2dC89cC6d609B0776f87b351AC812b37254B;
    address public constant BITCOIN_TOKEN = 0xAb264ab27E26e30bbcae342A82547CC4fFc2d63B;
    address public constant REP_TOKEN = 0xE5ED7874F022A1Cf72E8669cFA6ded1fe862a759;
    address public constant EURO_TOKEN = 0x24B7765eed848b3C4C4f60F2E3688480788becdc;
    address public constant DGX_TOKEN = 0xb8e99f1E8E96bF4659A6C852dF504DC066ed355E;
    address public constant GNOSIS_TOKEN = 0x46B6d09867Ee4f35d403c898d9D9D91D1EfFB875;
    address public constant GOLEM_TOKEN = 0x6577e3059B2c966dEe9E94F506a6e2525C4Ae519;
    address public constant ICONOMI_TOKEN = 0x8CeF6Ee89F2934428eeF2Cf54C8305CDE78635ac;

    // Fields that are only changed in constructor
    /// Note: By definition the price of the quote asset against itself (quote asset) is always equals one
    address quoteAsset; // Is the quote asset of a portfolio against which all other assets are priced against
    // Fields that can be changed by functions
    uint frequency = 30; // Frequency of updates in seconds
    uint validity = 600; // Time in seconds data is considered valid
    uint gasLimit = 500000;
    bytes ds_pubkey;

    AssetInfo[] public assets;
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

    function ignite() payable {
        oraclize_setProof(240);
        quoteAsset = ETHER_TOKEN; // Is the quote asset of a portfolio against which all other assets are priced against
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
        //enableContinuousDelivery();
        //oraclize_query('URL', oraclizeQuery, 500000);
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

    function setFrequency(uint newFrequency) pre_cond(isOwner())
    {
        if (frequency > validity) throw;
        frequency = newFrequency;
    }

    function setValidity(uint _validity) pre_cond(isOwner()) { validity = _validity; }

    function addAsset(string _ticker, address _newAsset) pre_cond(isOwner()) { assets.push(AssetInfo(_newAsset,_ticker)); }

    function rmAsset(address _assetRemoved) pre_cond(isOwner())
    {
        uint length = assets.length;
        for (uint i = 0; i < length; i++) {
            if (assets[i].assetAddress == _assetRemoved) {
                break;
            }
        }

        assets[i] = assets[assets.length - 1];
        assets.length--;
    }

}
