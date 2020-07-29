pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface KyberNetworkInterface {
    function maxGasPrice() external view returns(uint);
    function getUserCapInWei(address user) external view returns(uint);
    function getUserCapInTokenWei(address user, ERC20 token) external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);

    function tradeWithHint(
        address trader,
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes calldata hint
    ) external payable returns(uint);
}

/// this mock is used when only simple actions are required. no reserves are involved.
contract MockKyberNetwork is KyberNetworkInterface {

    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint  constant internal PRECISION = (10**18);
    uint  constant internal MAX_QTY   = (10**28); // 10B tokens
    uint  constant internal MAX_RATE  = (PRECISION * 10**6); // up to 1M tokens per ETH
    uint  constant internal MAX_DECIMALS = 18;
    uint  constant internal ETH_DECIMALS = 18;

    bool                 public override enabled = true;
    uint                 public override maxGasPrice = uint(-1);
    mapping(ERC20=>uint) public tokenPerEther; //rate in precision units relative to eth. i.e. if rate is 10**18 its same as 1:1
    mapping(ERC20=>uint) public etherPerToken; //rate in precision units relative to eth. i.e. if rate is 10**18 its same as 1:1

    receive() external payable {}

    function setRates(ERC20[] memory _tokens, uint[] memory _tokenPerEther, uint[] memory _etherPerToken) public {
      require(_tokens.length == _tokenPerEther.length, 'length mismatch');
      require(_tokens.length == _etherPerToken.length, 'length mismatch');

      for (uint i = 0; i < _tokens.length; ++i) {
        setRate(_tokens[i], _tokenPerEther[i], _etherPerToken[i]);
      }
    }

    function setRate(ERC20 _token, uint _tokenPerEther, uint _etherPerToken) public {
        require(_tokenPerEther >= 0, 'rate must not be negative');
        require(_etherPerToken >= 0, 'rate must not be negative');
        require(_token != ETH_TOKEN_ADDRESS, 'cannot set the rate of eth');

        tokenPerEther[_token] = _tokenPerEther;
        etherPerToken[_token] = _etherPerToken;
    }

    function getRate(ERC20 _src, ERC20 _dest)
        public
        view
        returns(uint rate)
    {
        if (_dest == _src) {
            return 0;
        }

        if (_dest == ETH_TOKEN_ADDRESS) {
            return etherPerToken[_src];
        }

        if (_src == ETH_TOKEN_ADDRESS) {
            return tokenPerEther[_dest];
        }

        uint srcRate = etherPerToken[_src];
        uint destRate = tokenPerEther[_dest];

        if (srcRate <= 0 || destRate <= 0) {
            return 0;
        }

        // destination per one source or n source to destination.
        return (srcRate * destRate) / PRECISION;
    }

    function getDecimals(ERC20 _token)
        internal
        view
        returns(uint)
    {
        if (_token == ETH_TOKEN_ADDRESS) {
            return ETH_DECIMALS;
        }
        
        return _token.decimals();
    }

    function calcDestAmount(uint _srcQty, uint _srcDecimals, uint _dstDecimals, uint _rate)
        internal
        pure
        returns(uint)
    {
        if (_dstDecimals >= _srcDecimals) {
            return (_srcQty * _rate * (10**(_dstDecimals - _srcDecimals))) / PRECISION;
        } else {
            return (_srcQty * _rate) / (PRECISION * (10**(_srcDecimals - _dstDecimals)));
        }
    }

    function getBalance(ERC20 _token)
        internal
        view
        returns(uint)
    {
        if (_token == ETH_TOKEN_ADDRESS) {
            return address(this).balance;
        }

        return _token.balanceOf(address(this));
    }

    function getUserCapInWei(address user)
        external
        override 
        view
        returns(uint)
    {
        user;

        return uint(-1);
    }

    function info(bytes32 _id)
        external
        override 
        view
        returns(uint)
    {
        _id;

        return uint(-1);
    }

    function getUserCapInTokenWei(address user, ERC20 token)
        external
        override 
        view
        returns(uint)
    {
        user;
        token;

        return uint(-1);
    }

    function getExpectedRate(ERC20 _src, ERC20 _dest, uint _srcQty)
        external
        override
        view
        returns(uint expectedRate, uint slippageRate)
    {
        _srcQty;
        expectedRate = getRate(_src, _dest);
        slippageRate = expectedRate * 97 / 100;
    }

    function tradeWithHint(
        address _trader,
        ERC20 _src,
        uint _srcAmount,
        ERC20 _dest,
        address _destAddress,
        uint _maxDestAmount,
        uint _minConversionRate,
        address _walletId,
        bytes memory _hint
    )
        public
        override
        payable
        returns(uint)
    {
        require(validateTradeInput(_src, _srcAmount, _dest, _destAddress), 'invalid trade input');

        _trader;
        _hint;
        _walletId;

        uint rate = getRate(_src, _dest);

        require(rate > 0, 'rate is zero');
        require(rate < MAX_RATE, 'rate above max rate');
        require(rate >= _minConversionRate, 'rate below min conversion rate');

        uint srcDecimals = getDecimals(_src);
        uint destDecimals = getDecimals(_dest);
        uint destAmount = calcDestAmount(_srcAmount, srcDecimals, destDecimals, rate);

        require(destAmount <= _maxDestAmount, 'maxDestAmount not supported');
        require(getBalance(_dest) >= destAmount, 'insufficient balanace');

        if (_dest == ETH_TOKEN_ADDRESS) {
            payable(_destAddress).transfer(destAmount);
        } else {
            require(_dest.transfer(_destAddress, destAmount), 'failed to transfer');
        }

        return destAmount;
    }

    function validateTradeInput(ERC20 _src, uint _srcAmount, ERC20 _dest, address _destAddress)
        internal
        view
        returns(bool)
    {
        require(_srcAmount <= MAX_QTY, 'max qty exceeded');
        require(_srcAmount != 0, 'src amount is zero');
        require(_destAddress != address(0), 'dest address is empty');
        require(_src != _dest, 'src and dest are identical');

        if (_src == ETH_TOKEN_ADDRESS) {
            require(msg.value == _srcAmount, 'src amount does not match message value for ether-to-token trade');
        } else {
            require(msg.value == 0, 'non-zero message value for token-to-token trade');
            //funds should have been moved to this contract already.
            require(_src.balanceOf(address(this)) >= _srcAmount, 'funds not moved to network');
        }

        return true;
    }
}
