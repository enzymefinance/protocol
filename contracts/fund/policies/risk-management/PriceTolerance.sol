// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../fund/shares/Shares.sol";
import "../../../prices/ValueInterpreter.sol";
import "../../../registry/Registry.sol";
import "../utils/CallOnIntegrationPostValidatePolicyBase.sol";

/// @title PriceTolerance Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Validate the price tolerance of a trade
contract PriceTolerance is PolicyBase, CallOnIntegrationPostValidatePolicyBase {
    using SafeMath for uint256;

    event PriceToleranceSet(address policyManager, uint256 value);

    uint256 internal constant ONE_HUNDRED_PERCENT = 10 ** 18;  // 100%

    mapping (address => uint256) public policyManagerToPriceTolerance;

    constructor(address _registry) public PolicyBase(_registry) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial policy settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    /// @dev Only called once, on PolicyManager.enablePolicies()
    function addFundSettings(bytes calldata _encodedSettings) external override onlyPolicyManager {
        uint256 priceTolerance = abi.decode(_encodedSettings, (uint256));
        require(
            priceTolerance <= ONE_HUNDRED_PERCENT,
            "addFundSettings: priceTolerance cannot exceed 100%"
        );

        policyManagerToPriceTolerance[msg.sender] = priceTolerance;
        emit PriceToleranceSet(msg.sender, priceTolerance);
    }

    /// @notice Provides a constant string identifier for a policy
    function identifier() external pure override returns (string memory) {
        return "PRICE_TOLERANCE";
    }

    /// @notice Apply the rule with specified paramters, in the context of a fund
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return True if the rule passes
    /// @dev A fund's PolicyManager is always the sender
    function validateRule(bytes calldata _encodedArgs)
        external
        override
        onlyPolicyManager
        returns (bool)
    {
        (
            ,
            ,
            address[] memory incomingAssets,
            uint256[] memory incomingAmounts,
            address[] memory outgoingAssets,
            uint256[] memory outgoingAmounts
        ) = __decodeRuleArgs(_encodedArgs);

        uint256 incomingAssetsValue = __calcCumulativeAssetsValue(incomingAssets, incomingAmounts);
        uint256 outgoingAssetsValue = __calcCumulativeAssetsValue(outgoingAssets, outgoingAmounts);

        // Only check case where there is more outgoing value
        if (incomingAssetsValue >= outgoingAssetsValue) return true;

        // Tolerance threshold is 'value defecit over total value of incoming assets'
        uint256 diff = outgoingAssetsValue.sub(incomingAssetsValue);
        if (
            diff.mul(ONE_HUNDRED_PERCENT).div(incomingAssetsValue) <=
            policyManagerToPriceTolerance[msg.sender]
        ) return true;

        return false;
    }

    // PRIVATE FUNCTIONS

    /// @notice Helper to calculate the cumulative value of a group of assets
    /// relative the fund's denomination asset
    function __calcCumulativeAssetsValue(address[] memory _assets, uint256[] memory _amounts)
        private
        returns (uint256 cumulativeValue_)
    {
        address denominationAsset = Shares(__getShares()).DENOMINATION_ASSET();

        for (uint256 i = 0; i < _assets.length; i++) {
            (
                uint256 assetValue,
                bool isValid
            ) = ValueInterpreter(__getValueInterpreter()).calcLiveAssetValue(
                _assets[i],
                _amounts[i],
                denominationAsset
            );
            require(
                assetValue > 0 && isValid,
                "__calcCumulativeAssetsValue: No valid price available for asset"
            );
            cumulativeValue_ = cumulativeValue_.add(assetValue);
        }
    }
}
