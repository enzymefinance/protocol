// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../dependencies/token/IERC20.sol";
import "../dependencies/DSMath.sol";
import "../prices/primitives/IPriceSource.sol";

/// @notice Intended for testing purposes only
/// @notice Updates and exposes price information
contract TestingPriceFeed is DSMath, IPriceSource {
    event PricesUpdated(address[] assets, uint256[] prices);

    struct Data {
        uint256 price;
        uint256 timestamp;
    }

    uint256 public constant override VALIDITY_INTERVAL = 2 days;

    address public QUOTE_ASSET;
    mapping(address => uint256) public assetsToDecimals;
    mapping(address => Data) public assetsToPrices;
    uint256 public override lastUpdate;
    bool neverValid = false;

    constructor(address _quoteAsset, uint256 _quoteDecimals) public {
        QUOTE_ASSET = _quoteAsset;
        setDecimals(_quoteAsset, _quoteDecimals);
    }

    // STATE-CHANGING FUNCTIONS

    // Input price is how much quote asset you get for one unit of _asset (10**assetDecimals)
    function update(address[] calldata _assets, uint256[] calldata _prices) external {
        require(_assets.length == _prices.length, "Array lengths unequal");
        for (uint256 i = 0; i < _assets.length; ++i) {
            assetsToPrices[_assets[i]] = Data({
                timestamp: block.timestamp,
                price: _prices[i]
            });
        }
        lastUpdate = block.timestamp;
        emit PricesUpdated(_assets, _prices);
    }

    function setDecimals(address _asset, uint256 _decimal) public {
        assetsToDecimals[_asset] = _decimal;
    }

    // VIEW FUNCTIONS

    // PRICES

    function getLiveRate(address _baseAsset, address _quoteAsset)
        public
        view
        override
        returns (uint256, bool)
    {
        uint256 quoteAssetPrice = assetsToPrices[_quoteAsset].price;
        if (quoteAssetPrice == 0) return (0, true);

        uint256 baseAssetPrice = assetsToPrices[_baseAsset].price;
        uint256 rate = mul(
            baseAssetPrice,
            10 ** uint256(ERC20WithFields(_quoteAsset).decimals())
        ) / quoteAssetPrice;

        return (rate, true);
    }

    function getCanonicalRate(address _baseAsset, address _quoteAsset)
        public
        view
        override
        returns (uint256, bool, uint256)
    {
        (uint256 rate, bool isValid) = getLiveRate(_baseAsset, _quoteAsset);
        return (rate, isValid, lastUpdate);
    }

    /// @notice Doesn't check validity as TestingPriceFeed has no validity variable
    /// @param _asset Asset in registrar
    function hasValidPrice(address _asset)
        public
        view
        override
        returns (bool)
    {
        uint256 price;
        (price,,) = getCanonicalRate(_asset, QUOTE_ASSET);
        return !neverValid && price != 0;
    }
}
