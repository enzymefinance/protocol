// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "./utils/PostCallOnIntegrationValidatePolicyBase.sol";

/// @title MaxConcentration Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that defines a configurable threshold for the concentration of any one asset
/// in a fund's holdings
contract MaxConcentration is PostCallOnIntegrationValidatePolicyBase {
    using SafeMath for uint256;

    event MaxConcentrationSet(address indexed comptrollerProxy, uint256 value);

    uint256 private constant ONE_HUNDRED_PERCENT = 10**18; // 100%

    address private immutable VALUE_INTERPRETER;

    mapping(address => uint256) private comptrollerProxyToMaxConcentration;

    constructor(address _policyManager, address _valueInterpreter)
        public
        PolicyBase(_policyManager)
    {
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Validates and initializes a policy as necessary prior to fund activation
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _vaultProxy The fund's VaultProxy address
    /// @dev No need to authenticate access, as there are no state transitions
    function activateForFund(address _comptrollerProxy, address _vaultProxy)
        external
        override
        onlyPolicyManager
    {
        require(
            passesRule(_comptrollerProxy, _vaultProxy, VaultLib(_vaultProxy).getTrackedAssets()),
            "activateForFund: Max concentration exceeded"
        );
    }

    /// @notice Add the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        uint256 maxConcentration = abi.decode(_encodedSettings, (uint256));
        require(maxConcentration > 0, "addFundSettings: maxConcentration must be greater than 0");
        require(
            maxConcentration <= ONE_HUNDRED_PERCENT,
            "addFundSettings: maxConcentration cannot exceed 100%"
        );

        comptrollerProxyToMaxConcentration[_comptrollerProxy] = maxConcentration;

        emit MaxConcentrationSet(_comptrollerProxy, maxConcentration);
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "MAX_CONCENTRATION";
    }

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _vaultProxy The fund's VaultProxy address
    /// @param _assets The assets with which to check the rule
    /// @return isValid_ True if the rule passes
    /// @dev The fund's denomination asset is exempt from the policy limit.
    function passesRule(
        address _comptrollerProxy,
        address _vaultProxy,
        address[] memory _assets
    ) public returns (bool isValid_) {
        uint256 maxConcentration = comptrollerProxyToMaxConcentration[_comptrollerProxy];
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);
        address denominationAsset = comptrollerProxyContract.getDenominationAsset();
        // Does not require asset finality, otherwise will fail when incoming asset is a Synth
        (uint256 totalGav, bool gavIsValid) = comptrollerProxyContract.calcGav(false);
        if (!gavIsValid) {
            return false;
        }

        for (uint256 i = 0; i < _assets.length; i++) {
            address asset = _assets[i];
            if (
                !__rulePassesForAsset(
                    _vaultProxy,
                    denominationAsset,
                    maxConcentration,
                    totalGav,
                    asset
                )
            ) {
                return false;
            }
        }

        return true;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _vaultProxy The fund's VaultProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    function validateRule(
        address _comptrollerProxy,
        address _vaultProxy,
        IPolicyManager.PolicyHook,
        bytes calldata _encodedArgs
    ) external override returns (bool isValid_) {
        (, , address[] memory incomingAssets, , , ) = __decodeRuleArgs(_encodedArgs);
        if (incomingAssets.length == 0) {
            return true;
        }

        return passesRule(_comptrollerProxy, _vaultProxy, incomingAssets);
    }

    /// @dev Helper to check if the rule holds for a particular asset.
    /// Avoids the stack-too-deep error.
    function __rulePassesForAsset(
        address _vaultProxy,
        address _denominationAsset,
        uint256 _maxConcentration,
        uint256 _totalGav,
        address _incomingAsset
    ) private returns (bool isValid_) {
        if (_incomingAsset == _denominationAsset) return true;

        uint256 assetBalance = ERC20(_incomingAsset).balanceOf(_vaultProxy);
        (uint256 assetGav, bool assetGavIsValid) = ValueInterpreter(VALUE_INTERPRETER)
            .calcLiveAssetValue(_incomingAsset, assetBalance, _denominationAsset);

        if (
            !assetGavIsValid ||
            assetGav.mul(ONE_HUNDRED_PERCENT).div(_totalGav) > _maxConcentration
        ) {
            return false;
        }

        return true;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the maxConcentration for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return maxConcentration_ The maxConcentration
    function getMaxConcentrationForFund(address _comptrollerProxy)
        external
        view
        returns (uint256 maxConcentration_)
    {
        return comptrollerProxyToMaxConcentration[_comptrollerProxy];
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() external view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}
