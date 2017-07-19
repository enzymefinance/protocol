import "./strings.sol";

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
