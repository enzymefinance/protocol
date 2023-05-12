// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";
import {TokenUtils} from "tests/utils/common/TokenUtils.sol";

import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

enum ChainlinkRateAsset {
    ETH,
    USD
}

abstract contract AssetUniverseUtils is Test, TokenUtils {
    function createTestAggregator(uint256 _price) internal returns (IChainlinkAggregator aggregator_) {
        return IChainlinkAggregator(address(new TestAggregator(_price)));
    }

    function updateTestAggregator(IChainlinkAggregator _aggregator, uint256 _price) internal {
        // TODO: This is a bit of a hack.
        TestAggregator(address(_aggregator)).setPrice(_price);
    }

    function createInvalidPriceTestAggregator() internal returns (IChainlinkAggregator aggregator_) {
        return IChainlinkAggregator(address(new TestAggregatorInvalidPrice()));
    }

    function createRegisteredPrimitive(IValueInterpreter _valueInterpreter, uint8 _decimals)
        internal
        returns (IERC20 token_)
    {
        token_ = createTestToken(_decimals);

        addPrimitive({
            _valueInterpreter: _valueInterpreter,
            _token: address(token_),
            _aggregator: address(createTestAggregator(1 ether)),
            _rateAsset: ChainlinkRateAsset.ETH
        });

        return token_;
    }

    function createRegisteredPrimitive(IValueInterpreter _valueInterpreter) internal returns (IERC20 token_) {
        return createRegisteredPrimitive(_valueInterpreter, 18);
    }

    function addPrimitive(IValueInterpreter _valueInterpreter, address _token, address _aggregator) internal {
        addPrimitive(_valueInterpreter, _token, _aggregator, ChainlinkRateAsset.ETH);
    }

    function addPrimitive(
        IValueInterpreter _valueInterpreter,
        address _token,
        address _aggregator,
        ChainlinkRateAsset _rateAsset
    ) internal {
        address[] memory primitives = new address[](1);
        primitives[0] = _token;

        address[] memory aggregators = new address[](1);
        aggregators[0] = _aggregator;

        ChainlinkRateAsset[] memory rateAssets = new ChainlinkRateAsset[](1);

        rateAssets[0] = _rateAsset;

        addPrimitives(_valueInterpreter, primitives, aggregators, rateAssets);
    }

    function addPrimitives(
        IValueInterpreter _valueInterpreter,
        address[] memory _primitives,
        address[] memory _aggregators,
        ChainlinkRateAsset[] memory _rateAssets
    ) internal {
        uint8[] memory rateAssetsUint8 = new uint8[](_rateAssets.length);
        for (uint256 i; i < _rateAssets.length; i++) {
            rateAssetsUint8[i] = uint8(_rateAssets[i]);
        }

        vm.prank(getValueInterpreterOwner(_valueInterpreter));

        _valueInterpreter.addPrimitives(_primitives, _aggregators, rateAssetsUint8);
    }

    function addDerivatives(
        IValueInterpreter _valueInterpreter,
        address[] memory _derivatives,
        address[] memory _priceFeeds
    ) internal {
        vm.prank(getValueInterpreterOwner(_valueInterpreter));

        _valueInterpreter.addDerivatives(_derivatives, _priceFeeds);
    }

    function addDerivative(IValueInterpreter _valueInterpreter, address _derivative, address _priceFeed) internal {
        address[] memory _derivatives = new address[](1);
        _derivatives[0] = _derivative;

        address[] memory _priceFeeds = new address[](1);
        _priceFeeds[0] = _priceFeed;

        addDerivatives({_valueInterpreter: _valueInterpreter, _derivatives: _derivatives, _priceFeeds: _priceFeeds});
    }

    function removePrimitive(IValueInterpreter _valueInterpreter, address _primitive) internal {
        address[] memory primitives = new address[](1);
        primitives[0] = _primitive;

        removePrimitives(_valueInterpreter, primitives);
    }

    function removePrimitives(IValueInterpreter _valueInterpreter, address[] memory _primitives) internal {
        vm.prank(getValueInterpreterOwner(_valueInterpreter));

        _valueInterpreter.removePrimitives(_primitives);
    }

    // TODO: Build a proper contract locator util for all contracts that have references between one another.
    function getValueInterpreterOwner(IValueInterpreter _valueInterpreter) internal view returns (address owner_) {
        return _valueInterpreter.getOwner();
    }
}

contract TestAggregator is IChainlinkAggregator {
    uint256 internal price;

    constructor(uint256 _price) {
        setPrice(_price);
    }

    function setPrice(uint256 _price) public {
        price = _price;
    }

    function latestRoundData() external view virtual returns (uint80, int256, uint256, uint256, uint80) {
        return (0, int256(price), 0, block.timestamp, 0);
    }
}

contract TestAggregatorInvalidPrice is TestAggregator(1) {
    function latestRoundData() external pure override returns (uint80, int256, uint256, uint256, uint80) {
        revert("Invalid price");
    }
}
