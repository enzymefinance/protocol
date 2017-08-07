pragma solidity ^0.4.11;

import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../libraries/strings.sol";
import "./PriceFeedAdapter.sol";

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

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
contract PriceFeed is PriceFeedAdapter, DBC, ECVerify, b64, JSON_Decoder,Owned {
    using strings for *;
    DateTime time = DateTime(0xe586cc86e5dfcf6e0578ea0dfcc0fcbe98ca988b);

    // TYPES

    struct Data  {
        address asset; // Address of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset}
        uint timestamp; // Timestamp of last price update of this asset
        address price; // Price of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset}
        string payload; // Of the CryptoCompare price feed call
        bytes digest;
    }

    struct Asset {
        address asset;

    }

    struct Input {
        address asset; // Address of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset}
        address price; // Price of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset}
    }

    // FIELDS

    // Constant fields
    /// Note: Frequency is purely self imposed and for information purposes only
    address constant CRYPTO_COMPARE_PUB_KEY = 0x81a1e5121a78d6fed79654dc71a47b4d8e5da848;
    bytes DS_PUBKEY = hex"a0f4f688350018ad1b9785991c0bde5f704b005dc79972b114dbed4a615a983710bfc647ebe5a320daa28771dce6a2d104f5efa2e4a85ba3760b76d46f8571ca";
    uint constant FREQUENCY = 120; // Frequency of updates in seconds
    uint constant VALIDITY = 60; // Time in seconds data is considered valid
    // Fields that are only changed in constructor
    /// Note: By definition the price of the quote asset against itself (quote asset) is always equals one
    address public QUOTE_ASSET; // Is the quote asset of a portfolio against which all other assets are priced against
    // Fields that can be changed by functions
    address[] public availableAssets;
    // Fields that can be changed by functions
    mapping (address => Data) data; // Address of asset => price of asset

    // PRE, POST, INVARIANT CONDITIONS

    function isDataSet(address ofAsset) internal returns (bool) { return data[ofAsset].timestamp > 0; }
    function isDataValid(address ofAsset) internal returns (bool) { return now - data[ofAsset].timestamp <= VALIDITY; }
    function isEqualLength(address[] x, uint[] y) internal returns (bool) { return x.length == y.length; }
    function arrayNotEmpty(address[] x) constant returns (bool) { return x.length >= 1; }

    // CONSTANT METHODS

    // Get price feed specific information
    function getQuoteAsset() constant returns (address) { return QUOTE_ASSET; }
    function getFrequency() constant returns (uint) { return FREQUENCY; }
    function getValidity() constant returns (uint) { return VALIDITY; }
    // Get availability of assets
    function numAvailableAssets() constant returns (uint) { return availableAssets.length; }
    function getAssetAt(uint id) constant returns (address) { return availableAssets[id]; }
    // Get asset specific information

    /// Pre: Asset has been initialised
    /// Post: Returns boolean if data is valid
    function isValid(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        returns (bool)
    {
        return now - data[ofAsset].timestamp <= VALIDITY;
    }

    /// Pre: Asset has been initialised and is active
    /// Post: Timestamp, where last updated not longer than `VALIDITY` seconds ago
    function getPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint)
    {
        return data[ofAsset].timestamp;
    }

    /// Pre: Asset has been initialised and is active
    /// Post: Timestamp and price of asset, where last updated not longer than `VALIDITY` seconds ago
    function getData(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint, uint)
    {
        return (data[ofAsset].timestamp, data[ofAsset].price);
    }

    // NON-CONSTANT METHODS

    /// Pre: Define a quote asset against which all prices are measured/based against
    /// Post: Price Feed contract w Backup Owner
    function PriceFeed(address ofQuoteAsset, address[] ofAvailableAssets)
        pre_cond(arrayNotEmpty(ofAvailableAssets))
    {
        QUOTE_ASSET = ofQuoteAsset;
        availableAssets = ofAvailableAssets;
    }

    /// Pre: Only Owner; Same sized input arrays
    /// Post: Update price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == ETH (in Wei), let asset == EUR-T, let Value of 1 EUR-T := 1 EUR == 0.080456789 ETH
     *  and let EUR-T decimals == 8,
     *  => data[EUR-T].price = 8045678 [Wei/ (EUR-T * 10**8)]
     */
    function updatePrice(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        pre_cond(isEqualLength(ofAssets, newPrices))
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            assert(data[ofAssets[i]].timestamp != now); // Intended to prevent several updates w/in one block, eg w different prices
            data[ofAssets[i]] = Data({
                timestamp: now,
                price: newPrices[i]
            });
            PriceUpdated(ofAssets[i], now, newPrices[i]);
        }
    }

    // TODO increase stake of price feed operator; gets lost iff data submitted w/o valid signature
    function proofOfInconsistency(string payload, bytes proof) {
        // Update prices only if native proof is verified
        if ((proof.length > 0) && (nativeProof_verify(payload, proof))) {
            // Everything OK
        } else {
            // curl -I https://min-api.cryptocompare.com/data/price\?fsym\=ETH\&tsyms\=ANT,BNT,BAT,BTC,DGD,DOGE,ETC,ETH,EUR,GNO,GNT,ICN,LTC,MLN,REP,XRP,SNGLS,SNT\&sign\=true

        }
    }

    /* The native proof is considered valid if the HTTP Date Header has a timestamp
    *  subsequent to the timestamp of execution of the last Oraclize callback,
    *  which is the time when the price data was updated.
    *  This check prevents Oraclize from doing replay attacks on the signed data.
    */
    function isRecent(string _dateHeader) internal constant returns(bool) {
        uint timestamp = time.parseDate(_dateHeader);
        if (timestamp >= now - VALIDITY) { // TODO change to last entry in ordered set
            return true;
        }
        return false;
    }

    function nativeProof_verify(string payload, bytes proof) private returns (bool) {
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
        bool dateok = isRecent(string(dateHeader));
        if (!dateok) return false;
        //Integrity
        bool digestok = (sha3(sha256(payload)) == sha3(b64decode(digest)));
        if (!digestok) return false;
        //Authenticity
        bool sigok;
        address signer;
        (sigok, signer) = ecrecovery(sha256(headers), sig);
        return (signer == address(sha3(DS_PUBKEY)));
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
}
