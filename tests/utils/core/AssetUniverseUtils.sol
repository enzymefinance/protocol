// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract AssetUniverseUtils is CoreUtilsBase {
    // AGGREGATORS

    function createTestAggregator() internal returns (TestChainlinkAggregator aggregator_) {
        return new TestChainlinkAggregator(CHAINLINK_AGGREGATOR_DECIMALS_ETH);
    }

    function createTestAggregator(uint8 _decimals) internal returns (TestChainlinkAggregator aggregator_) {
        return new TestChainlinkAggregator(_decimals);
    }

    function deployUsdEthSimulatedAggregator(address _ethUsdAggregatorAddress)
        internal
        returns (IChainlinkAggregator aggregator_)
    {
        return IChainlinkAggregator(deployCode("UsdEthSimulatedAggregator.sol", abi.encode(_ethUsdAggregatorAddress)));
    }

    function parseRateFromChainlinkAggregator(address _aggregatorAddress)
        internal
        view
        returns (uint256 rate_, uint256 timestamp_)
    {
        int256 answer;
        (, answer,, timestamp_,) = IChainlinkAggregator(_aggregatorAddress).latestRoundData();

        rate_ = uint256(answer);
    }

    // ASSET REGISTRATION

    function addDerivative(
        IValueInterpreter _valueInterpreter,
        address _tokenAddress,
        address _priceFeedAddress,
        bool _skipIfRegistered
    ) internal {
        // If the asset is already registered, either skip or remove it
        bool isRegistered = _valueInterpreter.isSupportedAsset(_tokenAddress);
        if (isRegistered && _skipIfRegistered) {
            return;
        }
        removeIfSupportedAsset({_valueInterpreter: _valueInterpreter, _tokenAddress: _tokenAddress});

        vm.prank(_valueInterpreter.getOwner());
        _valueInterpreter.addDerivatives(toArray(_tokenAddress), toArray(_priceFeedAddress));
    }

    function addDerivatives(
        IValueInterpreter _valueInterpreter,
        address[] memory _tokenAddresses,
        address[] memory _priceFeedAddresses,
        bool _skipIfRegistered
    ) internal {
        for (uint256 i; i < _tokenAddresses.length; i++) {
            addDerivative(_valueInterpreter, _tokenAddresses[i], _priceFeedAddresses[i], _skipIfRegistered);
        }
    }

    function addPrimitive(
        IValueInterpreter _valueInterpreter,
        address _tokenAddress,
        address _aggregatorAddress,
        IChainlinkPriceFeedMixinProd.RateAsset _rateAsset,
        bool _skipIfRegistered
    ) internal {
        // If the asset is already registered, either skip or remove it
        bool isRegistered = _valueInterpreter.isSupportedAsset(_tokenAddress);
        if (isRegistered && _skipIfRegistered) {
            return;
        }

        removeIfSupportedAsset({_valueInterpreter: _valueInterpreter, _tokenAddress: _tokenAddress});

        IValueInterpreter.RateAsset[] memory rateAssets = new IValueInterpreter.RateAsset[](1);
        rateAssets[0] = formatChainlinkRateAsset(_rateAsset);

        vm.prank(_valueInterpreter.getOwner());
        _valueInterpreter.addPrimitives({
            _primitives: toArray(_tokenAddress),
            _aggregators: toArray(_aggregatorAddress),
            _rateAssets: rateAssets
        });
    }

    function addPrimitives(
        IValueInterpreter _valueInterpreter,
        address[] memory _tokenAddresses,
        address[] memory _aggregatorAddresses,
        IChainlinkPriceFeedMixinProd.RateAsset[] memory _rateAssets,
        bool _skipIfRegistered
    ) internal {
        for (uint256 i; i < _tokenAddresses.length; i++) {
            addPrimitive(
                _valueInterpreter, _tokenAddresses[i], _aggregatorAddresses[i], _rateAssets[i], _skipIfRegistered
            );
        }
    }

    function addPrimitiveWithTestAggregator(
        IValueInterpreter _valueInterpreter,
        address _tokenAddress,
        bool _skipIfRegistered
    ) internal returns (TestChainlinkAggregator aggregator_) {
        aggregator_ = createTestAggregator();

        addPrimitive(
            _valueInterpreter,
            _tokenAddress,
            address(aggregator_),
            IChainlinkPriceFeedMixinProd.RateAsset.ETH,
            _skipIfRegistered
        );

        return aggregator_;
    }

    function addPrimitivesWithTestAggregator(
        IValueInterpreter _valueInterpreter,
        address[] memory _tokenAddresses,
        bool _skipIfRegistered
    ) internal returns (TestChainlinkAggregator[] memory aggregators_) {
        aggregators_ = new TestChainlinkAggregator[](_tokenAddresses.length);
        for (uint256 i; i < _tokenAddresses.length; i++) {
            aggregators_[i] = addPrimitiveWithTestAggregator(_valueInterpreter, _tokenAddresses[i], _skipIfRegistered);
        }

        return aggregators_;
    }

    function createRegisteredPrimitive(IValueInterpreter _valueInterpreter, uint8 _decimals)
        internal
        returns (IERC20 token_)
    {
        token_ = createTestToken(_decimals);

        addPrimitive({
            _valueInterpreter: _valueInterpreter,
            _tokenAddress: address(token_),
            _aggregatorAddress: address(createTestAggregator()),
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH,
            _skipIfRegistered: false
        });

        return token_;
    }

    function registerPrimitivePairWithPrice(
        IValueInterpreter _valueInterpreter,
        IERC20 _assetA,
        IERC20 _assetB,
        uint256 _assetBAmountPerUnitA
    ) internal {
        require(_assetA != _assetB, "registerPrimitivePairWithPrice: same asset");

        // Both assets should use the same feed quote asset, i.e., intermediary asset.
        // Since WETH is auto-mapped to ETH and we can't deregister it, we must use ETH as the rate asset.
        IChainlinkPriceFeedMixinProd.RateAsset rateAsset = IChainlinkPriceFeedMixinProd.RateAsset.ETH;

        // If weth is assetA, reverse the asset order
        address wethAddress = _valueInterpreter.getWethToken();
        if (address(_assetA) == wethAddress) {
            _assetBAmountPerUnitA = assetUnit(_assetA) * assetUnit(_assetB) / _assetBAmountPerUnitA;
            (_assetA, _assetB) = (_assetB, _assetA);
        }

        // TODO: need to include asset unit?
        TestChainlinkAggregator assetAAggregator = createTestAggregator();
        assetAAggregator.setPrice(_assetBAmountPerUnitA);
        addPrimitive({
            _valueInterpreter: _valueInterpreter,
            _tokenAddress: address(_assetA),
            _aggregatorAddress: address(assetAAggregator),
            _rateAsset: rateAsset,
            _skipIfRegistered: false
        });

        if (address(_assetB) != wethAddress) {
            TestChainlinkAggregator assetBAggregator = createTestAggregator();
            uint256 assetBAmount = assetUnit(_assetB);
            assetBAggregator.setPrice(assetBAmount);
            addPrimitive({
                _valueInterpreter: _valueInterpreter,
                _tokenAddress: address(_assetB),
                _aggregatorAddress: address(assetBAggregator),
                _rateAsset: rateAsset,
                _skipIfRegistered: false
            });
        }

        // Double-check that the registered price is what we expect
        uint256 newCanonicalPrice = _valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(_assetA),
            _amount: assetUnit(_assetA),
            _quoteAsset: address(_assetB)
        });
        assertApproxEqAbs(newCanonicalPrice, _assetBAmountPerUnitA, 1, "registerPrimitivePairWithPrice: price mismatch");
    }

    function removeIfSupportedAsset(IValueInterpreter _valueInterpreter, address _tokenAddress) internal {
        require(_tokenAddress != _valueInterpreter.getWethToken(), "removeIfSupportedAsset: weth");

        vm.startPrank(_valueInterpreter.getOwner());

        if (_valueInterpreter.isSupportedPrimitiveAsset(_tokenAddress)) {
            _valueInterpreter.removePrimitives(toArray(_tokenAddress));
        } else if (_valueInterpreter.isSupportedDerivativeAsset(_tokenAddress)) {
            _valueInterpreter.removeDerivatives(toArray(_tokenAddress));
        }

        vm.stopPrank();
    }

    // VALUE CALCS

    function calcTokenPrice(IValueInterpreter _valueInterpreter, IERC20 _baseAsset, IERC20 _quoteAsset)
        internal
        returns (uint256 valueOfOneUnit_)
    {
        return _valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(_baseAsset),
            _amount: assetUnit(_baseAsset),
            _quoteAsset: address(_quoteAsset)
        });
    }
}

contract TestChainlinkAggregator is IChainlinkAggregator {
    uint8 public immutable decimals;
    int256 internal price;
    uint256 internal timestamp;

    /// @dev Starting price is 1:1 with rate asset
    constructor(uint8 _decimals) {
        decimals = _decimals;
        price = int256(10 ** _decimals);
    }

    function getTimestamp() public view returns (uint256) {
        return timestamp > 0 ? timestamp : block.timestamp;
    }

    function setPrice(uint256 _price) public {
        price = int256(_price);
    }

    function setPriceInt(int256 _price) public {
        price = _price;
    }

    function setTimestamp(uint256 _timestamp) public {
        timestamp = _timestamp;
    }

    // Chainlink functions

    function latestRoundData() external view virtual returns (uint80, int256, uint256, uint256, uint80) {
        return (0, price, 0, getTimestamp(), 0);
    }
}
