// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
import "../../release/infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";

contract MockPrimitivePriceFeed is IPrimitivePriceFeed {
    uint256 private immutable DECIMALS;

    mapping(address => mapping(address => CanonicalRate)) private baseToQuoteToCanonicalRate;
    mapping(address => bool) private primitiveToSupported;

    struct CanonicalRate {
        bool isValid;
        uint256 rate;
    }

    constructor(address[] memory _primitives, uint256 _decimals) public {
        DECIMALS = _decimals;
        for (uint256 i = 0; i < _primitives.length; i++) {
            setIsSupportedAsset(_primitives[i], true);
        }
    }

    function setCanonicalRate(
        address _base,
        address _quote,
        uint256 _rate,
        bool _isValid
    ) external {
        baseToQuoteToCanonicalRate[_base][_quote] = CanonicalRate({
            isValid: _isValid,
            rate: _rate
        });
    }

    function getLiveRate(address _base, address _quote)
        external
        view
        override
        returns (uint256 rate_, bool isValid_)
    {
        return getCanonicalRate(_base, _quote);
    }

    function getCanonicalRate(address _base, address _quote)
        public
        view
        override
        returns (uint256 rate_, bool isValid_)
    {
        if (_base == _quote) {
            rate_ = 10**DECIMALS;
            isValid_ = true;
        } else {
            rate_ = baseToQuoteToCanonicalRate[_base][_quote].rate;
            isValid_ = baseToQuoteToCanonicalRate[_base][_quote].isValid;
        }
    }

    function isSupportedAsset(address _primitive) external view override returns (bool) {
        return primitiveToSupported[_primitive];
    }

    function setIsSupportedAsset(address _primitive, bool _isSupported) public returns (bool) {
        primitiveToSupported[_primitive] = _isSupported;
    }
}
