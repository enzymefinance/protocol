// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IValueInterpreter {
    event DerivativeAdded(address indexed derivative, address priceFeed);
    event DerivativeRemoved(address indexed derivative);
    event EthUsdAggregatorSet(address prevEthUsdAggregator, address nextEthUsdAggregator);
    event PrimitiveAdded(address indexed primitive, address aggregator, uint8 rateAsset, uint256 unit);
    event PrimitiveRemoved(address indexed primitive);

    function addDerivatives(address[] memory _derivatives, address[] memory _priceFeeds) external;
    function addPrimitives(address[] memory _primitives, address[] memory _aggregators, uint8[] memory _rateAssets)
        external;
    function calcCanonicalAssetValue(address _baseAsset, uint256 _amount, address _quoteAsset)
        external
        returns (uint256 value_);
    function calcCanonicalAssetsTotalValue(address[] memory _baseAssets, uint256[] memory _amounts, address _quoteAsset)
        external
        returns (uint256 value_);
    function getAggregatorForPrimitive(address _primitive) external view returns (address aggregator_);
    function getEthUsdAggregator() external view returns (address ethUsdAggregator_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getOwner() external view returns (address owner_);
    function getPriceFeedForDerivative(address _derivative) external view returns (address priceFeed_);
    function getRateAssetForPrimitive(address _primitive) external view returns (uint8 rateAsset_);
    function getStaleRateThreshold() external view returns (uint256 staleRateThreshold_);
    function getUnitForPrimitive(address _primitive) external view returns (uint256 unit_);
    function getWethToken() external view returns (address wethToken_);
    function isSupportedAsset(address _asset) external view returns (bool isSupported_);
    function isSupportedDerivativeAsset(address _asset) external view returns (bool isSupported_);
    function isSupportedPrimitiveAsset(address _asset) external view returns (bool isSupported_);
    function removeDerivatives(address[] memory _derivatives) external;
    function removePrimitives(address[] memory _primitives) external;
    function setEthUsdAggregator(address _nextEthUsdAggregator) external;
    function updateDerivatives(address[] memory _derivatives, address[] memory _priceFeeds) external;
    function updatePrimitives(address[] memory _primitives, address[] memory _aggregators, uint8[] memory _rateAssets)
        external;
}
