// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "./utils/CallOnIntegrationPostValidatePolicyBase.sol";

/// @title MaxConcentration Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A concentration limit for any given asset in a particular fund
contract MaxConcentration is CallOnIntegrationPostValidatePolicyBase {
    using SafeMath for uint256;

    event MaxConcentrationSet(address comptrollerProxy, uint256 value);

    uint256 private constant ONE_HUNDRED_PERCENT = 10**18; // 100%

    mapping(address => uint256) private comptrollerProxyToMaxConcentration;

    constructor(address _policyManager) public PolicyBase(_policyManager) {}

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
    function identifier() external override pure returns (string memory identifier_) {
        return "MAX_CONCENTRATION";
    }

    /// @notice Apply the rule with specified parameters, in the context of a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev Uses live rates for gav calcs.
    /// The fund's denomination asset is exempt from the policy limit.
    function validateRule(address _comptrollerProxy, bytes calldata _encodedArgs)
        external
        override
        returns (bool isValid_)
    {
        (, , address[] memory incomingAssets, , , ) = __decodeRuleArgs(_encodedArgs);
        if (incomingAssets.length == 0) {
            return true;
        }

        uint256 maxConcentration = comptrollerProxyToMaxConcentration[_comptrollerProxy];
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);
        (
            address derivativePriceFeed,
            ,
            ,
            ,
            ,
            address primitivePriceFeed,
            address valueInterpreter
        ) = comptrollerProxyContract.getRoutes();
        uint256 totalGav = comptrollerProxyContract.calcGav(true);

        for (uint256 i = 0; i < incomingAssets.length; i++) {
            if (
                !__ruleIsValidForAsset(
                    comptrollerProxyContract.getVaultProxy(),
                    valueInterpreter,
                    primitivePriceFeed,
                    derivativePriceFeed,
                    comptrollerProxyContract.getDenominationAsset(),
                    maxConcentration,
                    totalGav,
                    incomingAssets[i]
                )
            ) {
                return false;
            }
        }

        return true;
    }

    /// @dev Helper to check if the rule holds for a particular asset.
    /// Avoids the stack-too-deep error.
    function __ruleIsValidForAsset(
        address _vaultProxy,
        address _valueInterpreter,
        address _primitivePriceFeed,
        address _derivativePriceFeed,
        address _denominationAsset,
        uint256 _maxConcentration,
        uint256 _totalGav,
        address _incomingAsset
    ) private returns (bool isValid_) {
        if (_incomingAsset == _denominationAsset) return true;

        uint256 assetBalance = IERC20(_incomingAsset).balanceOf(_vaultProxy);
        (uint256 assetGav, bool assetGavIsValid) = ValueInterpreter(_valueInterpreter)
            .calcLiveAssetValue(
            _primitivePriceFeed,
            _derivativePriceFeed,
            _incomingAsset,
            assetBalance,
            _denominationAsset
        );

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

    function getMaxConcentrationForFund(address _comptrollerProxy)
        external
        view
        returns (uint256 maxConcentration_)
    {
        return comptrollerProxyToMaxConcentration[_comptrollerProxy];
    }
}
