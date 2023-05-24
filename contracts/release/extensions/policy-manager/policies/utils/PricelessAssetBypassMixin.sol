// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";

/// @title PricelessAssetBypassMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mixin that facilitates timelocked actions for an asset that does not have a valid price
abstract contract PricelessAssetBypassMixin {
    using SafeMath for uint256;

    event PricelessAssetBypassed(address indexed comptrollerProxy, address indexed asset);

    event PricelessAssetTimelockStarted(address indexed comptrollerProxy, address indexed asset);

    uint256 private immutable PRICELESS_ASSET_BYPASS_TIMELOCK;
    uint256 private immutable PRICELESS_ASSET_BYPASS_TIME_LIMIT;
    address private immutable PRICELESS_ASSET_BYPASS_VALUE_INTERPRETER;
    address private immutable PRICELESS_ASSET_BYPASS_WETH_TOKEN;

    mapping(address => mapping(address => uint256)) private comptrollerProxyToAssetToBypassWindowStart;

    constructor(address _valueInterpreter, address _wethToken, uint256 _timelock, uint256 _timeLimit) public {
        PRICELESS_ASSET_BYPASS_TIMELOCK = _timelock;
        PRICELESS_ASSET_BYPASS_TIME_LIMIT = _timeLimit;
        PRICELESS_ASSET_BYPASS_VALUE_INTERPRETER = _valueInterpreter;
        PRICELESS_ASSET_BYPASS_WETH_TOKEN = _wethToken;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Starts the timelock period for an asset without a valid price
    /// @param _asset The asset for which to start the timelock period
    /// @dev This function must be called via ComptrollerProxy.vaultCallOnContract().
    /// This allows the function to be gas relay-able.
    /// It also means that the originator must be the owner.
    function startAssetBypassTimelock(address _asset) external {
        // No need to validate whether the VaultProxy is an Enzyme contract
        address comptrollerProxy = VaultLib(msg.sender).getAccessor();
        require(
            msg.sender == ComptrollerLib(comptrollerProxy).getVaultProxy(),
            "startAssetBypassTimelock: Sender is not the VaultProxy of the associated ComptrollerProxy"
        );

        try ValueInterpreter(getPricelessAssetBypassValueInterpreter()).calcCanonicalAssetValue(
            _asset,
            1, // Any value >0 will attempt to retrieve a rate
            getPricelessAssetBypassWethToken() // Any valid asset would do
        ) {
            revert("startAssetBypassTimelock: Asset has a price");
        } catch {
            comptrollerProxyToAssetToBypassWindowStart[comptrollerProxy][_asset] =
                block.timestamp.add(getPricelessAssetBypassTimelock());

            emit PricelessAssetTimelockStarted(comptrollerProxy, _asset);
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether an asset is bypassable (if still without a valid price) for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset for which to check if it is bypassable
    /// @return isBypassable_ True if the asset is bypassable
    function assetIsBypassableForFund(address _comptrollerProxy, address _asset)
        public
        view
        returns (bool isBypassable_)
    {
        uint256 windowStart = getAssetBypassWindowStartForFund(_comptrollerProxy, _asset);

        return windowStart <= block.timestamp && windowStart.add(getPricelessAssetBypassTimeLimit()) >= block.timestamp;
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to execute __calcValueExcludingBypassablePricelessAsset() for an array of base asset amounts
    function __calcTotalValueExlcudingBypassablePricelessAssets(
        address _comptrollerProxy,
        address[] memory _baseAssets,
        uint256[] memory _baseAssetAmounts,
        address _quoteAsset
    ) internal returns (uint256 value_) {
        for (uint256 i; i < _baseAssets.length; i++) {
            value_ = value_.add(
                __calcValueExcludingBypassablePricelessAsset(
                    _comptrollerProxy, _baseAssets[i], _baseAssetAmounts[i], _quoteAsset
                )
            );
        }
    }

    /// @dev Helper to calculate the value of a base asset amount in terms of a quote asset,
    /// returning a value of `0` for an asset without a valid price that is within its bypass window
    function __calcValueExcludingBypassablePricelessAsset(
        address _comptrollerProxy,
        address _baseAsset,
        uint256 _baseAssetAmount,
        address _quoteAsset
    ) internal returns (uint256 value_) {
        try ValueInterpreter(getPricelessAssetBypassValueInterpreter()).calcCanonicalAssetValue(
            _baseAsset, _baseAssetAmount, _quoteAsset
        ) returns (uint256 result) {
            return result;
        } catch {
            require(
                assetIsBypassableForFund(_comptrollerProxy, _baseAsset),
                "__calcValueExcludingBypassablePricelessAsset: Invalid asset not bypassable"
            );

            emit PricelessAssetBypassed(_comptrollerProxy, _baseAsset);
        }

        return 0;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the timestamp from which an asset without a valid price can be considered to be valued at `0`
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset
    /// @return windowStart_ The timestamp
    function getAssetBypassWindowStartForFund(address _comptrollerProxy, address _asset)
        public
        view
        returns (uint256 windowStart_)
    {
        return comptrollerProxyToAssetToBypassWindowStart[_comptrollerProxy][_asset];
    }

    /// @notice Gets the `PRICELESS_ASSET_BYPASS_TIME_LIMIT` variable
    /// @return timeLimit_ The `PRICELESS_ASSET_BYPASS_TIME_LIMIT` variable value
    function getPricelessAssetBypassTimeLimit() public view returns (uint256 timeLimit_) {
        return PRICELESS_ASSET_BYPASS_TIME_LIMIT;
    }

    /// @notice Gets the `PRICELESS_ASSET_BYPASS_TIMELOCK` variable
    /// @return timelock_ The `PRICELESS_ASSET_BYPASS_TIMELOCK` variable value
    function getPricelessAssetBypassTimelock() public view returns (uint256 timelock_) {
        return PRICELESS_ASSET_BYPASS_TIMELOCK;
    }

    /// @notice Gets the `PRICELESS_ASSET_BYPASS_VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `PRICELESS_ASSET_BYPASS_VALUE_INTERPRETER` variable value
    function getPricelessAssetBypassValueInterpreter() public view returns (address valueInterpreter_) {
        return PRICELESS_ASSET_BYPASS_VALUE_INTERPRETER;
    }

    /// @notice Gets the `PRICELESS_ASSET_BYPASS_WETH_TOKEN` variable
    /// @return wethToken_ The `PRICELESS_ASSET_BYPASS_WETH_TOKEN` variable value
    function getPricelessAssetBypassWethToken() public view returns (address wethToken_) {
        return PRICELESS_ASSET_BYPASS_WETH_TOKEN;
    }
}
