pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IKyberNetworkProxy {
    function maxGasPrice() external view returns(uint);
    function getUserCapInWei(address) external view returns(uint);
    function getUserCapInTokenWei(address, ERC20) external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32) external view returns(uint256);
    function swapEtherToToken(ERC20, uint256) external payable returns(uint256);
    function swapTokenToEther(ERC20, uint256, uint256) external returns(uint256);
    function swapTokenToToken(ERC20, uint256, ERC20, uint256) external returns(uint256);
    function getExpectedRate(ERC20, ERC20, uint256) external view returns (uint256, uint256);
    function tradeWithHint(ERC20, uint256, ERC20, address, uint256, uint256, address, bytes calldata) external payable returns(uint);
}

contract MockKyberNetwork is IKyberNetworkProxy {

    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint256 constant internal PRECISION = (10**18);
    uint256 constant internal MAX_QTY   = (10**28); // 10B tokens
    uint256 constant internal MAX_RATE  = (PRECISION * 10**6); // up to 1M tokens per ETH
    uint256 constant internal MAX_DECIMALS = 18;
    uint256 constant internal ETH_DECIMALS = 18;
    uint256 public override maxGasPrice = uint256(-1);
    bool public override enabled = true;
    mapping(ERC20=>uint256) public tokenPerEther; //rate in precision units relative to eth. i.e. if rate is 10**18 its same as 1:1
    mapping(ERC20=>uint256) public etherPerToken; //rate in precision units relative to eth. i.e. if rate is 10**18 its same as 1:1

    receive() external payable {}

    function setRates(ERC20[] memory _tokens, uint256[] memory _tokenPerEther, uint256[] memory _etherPerToken) public {
      require(_tokens.length == _tokenPerEther.length, 'length mismatch');
      require(_tokens.length == _etherPerToken.length, 'length mismatch');

      for (uint i = 0; i < _tokens.length; ++i) {
        setRate(_tokens[i], _tokenPerEther[i], _etherPerToken[i]);
      }
    }

    function setRate(ERC20 _token, uint256 _tokenPerEther, uint256 _etherPerToken) public {
        require(_tokenPerEther >= 0, 'rate must not be negative');
        require(_etherPerToken >= 0, 'rate must not be negative');
        require(_token != ETH_TOKEN_ADDRESS, 'cannot set the rate of eth');

        tokenPerEther[_token] = _tokenPerEther;
        etherPerToken[_token] = _etherPerToken;
    }

    function getRate(ERC20 _src, ERC20 _dest)
        public
        view
        returns(uint256 rate)
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

        uint256 srcRate = etherPerToken[_src];
        uint256 destRate = tokenPerEther[_dest];

        if (srcRate <= 0 || destRate <= 0) {
            return 0;
        }

        // destination per one source or n source to destination.
        return (srcRate * destRate) / PRECISION;
    }

    function getDecimals(ERC20 _token)
        internal
        view
        returns(uint256)
    {
        if (_token == ETH_TOKEN_ADDRESS) {
            return ETH_DECIMALS;
        }
        
        return _token.decimals();
    }

    function calcDestAmount(uint256 _srcQty, uint256 _srcDecimals, uint256 _dstDecimals, uint256 _rate)
        internal
        pure
        returns(uint256)
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
        returns(uint256)
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
        returns(uint256)
    {
        user;

        return uint256(-1);
    }

    function info(bytes32 _id)
        external
        override 
        view
        returns(uint256)
    {
        _id;

        return uint256(-1);
    }

    function getUserCapInTokenWei(address user, ERC20 token)
        external
        override 
        view
        returns(uint256)
    {
        user;
        token;

        return uint256(-1);
    }

    function getExpectedRate(ERC20 _src, ERC20 _dest, uint256 _srcQty)
        external
        override
        view
        returns(uint256 expectedRate, uint256 slippageRate)
    {
        _srcQty;
        expectedRate = getRate(_src, _dest);
        slippageRate = expectedRate * 97 / 100;
    }

    function swapTokenToToken(
        ERC20 _src,
        uint256 _srcAmount,
        ERC20 _dest,
        uint256 _minConversionRate
    )
        external
        override
        returns(uint256)
    {
        bytes memory hint;

        return tradeWithHint(
            _src,
            _srcAmount,
            _dest,
            msg.sender,
            MAX_QTY,
            _minConversionRate,
            address(0),
            hint
        );
    }

    function swapEtherToToken(
        ERC20 _token,
        uint256 _minConversionRate
    )
        external
        override
        payable
        returns(uint256)
    {
        bytes memory hint;

        return tradeWithHint(
            ETH_TOKEN_ADDRESS,
            msg.value,
            _token,
            msg.sender,
            MAX_QTY,
            _minConversionRate,
            address(0),
            hint
        );
    }

    function swapTokenToEther(
        ERC20 _token,
        uint256 _srcAmount,
        uint256 _minConversionRate
    )
        external
        override
        returns(uint256)
    {
        bytes memory hint;

        return tradeWithHint(
            _token,
            _srcAmount,
            ETH_TOKEN_ADDRESS,
            msg.sender,
            MAX_QTY,
            _minConversionRate,
            address(0),
            hint
        );
    }

    function tradeWithHint(
        ERC20 _src,
        uint256 _srcAmount,
        ERC20 _dest,
        address _destAddress,
        uint256 _maxDestAmount,
        uint256 _minConversionRate,
        address _walletId,
        bytes memory _hint
    )
        public
        override
        payable
        returns(uint256)
    {
        require(validateTradeInput(_src, _srcAmount, _dest, _destAddress), 'invalid trade input');

        _hint;
        _walletId;

        uint256 rate = getRate(_src, _dest);

        require(rate > 0, 'rate is zero');
        require(rate < MAX_RATE, 'rate above max rate');
        require(rate >= _minConversionRate, 'rate below min conversion rate');

        uint256 srcDecimals = getDecimals(_src);
        uint256 destDecimals = getDecimals(_dest);
        uint256 destAmount = calcDestAmount(_srcAmount, srcDecimals, destDecimals, rate);

        require(destAmount <= _maxDestAmount, 'maxDestAmount not supported');
        require(getBalance(_dest) >= destAmount, 'insufficient balanace');

        if (_dest == ETH_TOKEN_ADDRESS) {
            payable(_destAddress).transfer(destAmount);
        } else {
            _dest.transfer(_destAddress, destAmount);
        }

        if (_src != ETH_TOKEN_ADDRESS) {
            _src.transferFrom(msg.sender, address(this), _srcAmount);
        }

        return destAmount;
    }

    function validateTradeInput(ERC20 _src, uint256 _srcAmount, ERC20 _dest, address _destAddress)
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
            require(_src.balanceOf(address(this)) >= _srcAmount, 'funds not moved to network');
        }

        return true;
    }
}
