// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IValueInterpreter} from "../../../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import {IPolicyManager} from "../../../IPolicyManager.sol";
import {INoDepegPolicyBase} from "../interfaces/INoDepegPolicyBase.sol";
import {PolicyBase} from "./PolicyBase.sol";

/// @title NoDepegPolicyBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base policy that validates when one of a list of assets has a price that
/// deviates significantly from its expected peg
abstract contract NoDepegPolicyBase is INoDepegPolicyBase, PolicyBase {
    event FundSettingsUpdated(address indexed comptrollerProxy, AssetConfig[] assetConfigs);

    uint256 private constant BPS_ONE_HUNDRED_PERCENT = 10_000;

    IValueInterpreter private immutable VALUE_INTERPRETER;

    mapping(address => AssetConfig[]) private comptrollerProxyToAssetConfigs;

    constructor(address _policyManagerAddress, IValueInterpreter _valueInterpreter) PolicyBase(_policyManagerAddress) {
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Adds the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        __updateFundSettings({_comptrollerProxy: _comptrollerProxy, _encodedSettings: _encodedSettings});
    }

    /// @notice Whether or not the policy can be disabled
    /// @return canDisable_ True if the policy can be disabled
    function canDisable() external pure override returns (bool canDisable_) {
        return true;
    }

    /// @notice Updates the policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev Assigns a new array of AssetConfigs to the fund, overwriting (deleting) the previous one
    function updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        delete comptrollerProxyToAssetConfigs[_comptrollerProxy];

        __updateFundSettings({_comptrollerProxy: _comptrollerProxy, _encodedSettings: _encodedSettings});
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary, as state is not updated and no events are fired
    function validateRule(address _comptrollerProxy, IPolicyManager.PolicyHook, bytes calldata)
        external
        override
        returns (bool isValid_)
    {
        uint256 assetsLength = comptrollerProxyToAssetConfigs[_comptrollerProxy].length;

        for (uint256 i; i < assetsLength; i++) {
            AssetConfig memory assetConfig = comptrollerProxyToAssetConfigs[_comptrollerProxy][i];

            uint256 assetPrice = VALUE_INTERPRETER.calcCanonicalAssetValue({
                _baseAsset: address(assetConfig.asset),
                _amount: 10 ** assetConfig.asset.decimals(),
                _quoteAsset: address(assetConfig.referenceAsset)
            });
            uint256 referencePrice = 10 ** assetConfig.referenceAsset.decimals();

            uint256 rawDeviation;
            if (assetPrice > referencePrice) {
                rawDeviation = assetPrice - referencePrice;
            } else {
                rawDeviation = referencePrice - assetPrice;
            }

            uint256 deviationBps = BPS_ONE_HUNDRED_PERCENT * rawDeviation / referencePrice;
            // Use >= to account for flooring of deviationBps
            if (deviationBps >= assetConfig.deviationToleranceInBps) {
                return false;
            }
        }

        return true;
    }

    function __updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings) private {
        (AssetConfig[] memory assetConfigs) = abi.decode(_encodedSettings, (AssetConfig[]));

        uint256 assetsLength = assetConfigs.length;
        for (uint256 i; i < assetsLength; i++) {
            uint256 deviationTolerance = assetConfigs[i].deviationToleranceInBps;
            require(deviationTolerance > 0, "__updateFundSettings: Missing deviation tolerance");
            require(deviationTolerance < BPS_ONE_HUNDRED_PERCENT, "__updateFundSettings: Max deviation tolerance");

            comptrollerProxyToAssetConfigs[_comptrollerProxy].push(assetConfigs[i]);
        }

        emit FundSettingsUpdated(_comptrollerProxy, assetConfigs);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the AssetConfig[] values for a given fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @dev Not concerned with unbounded loop as the policy itself would also always fail in that case
    function getAssetConfigsForFund(address _comptrollerProxy)
        external
        view
        returns (AssetConfig[] memory assetConfigs_)
    {
        return comptrollerProxyToAssetConfigs[_comptrollerProxy];
    }
}
