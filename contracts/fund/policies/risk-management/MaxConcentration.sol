// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../prices/ValueInterpreter.sol";
import "../../shares/Shares.sol";
import "../../vault/Vault.sol";
import "../utils/CallOnIntegrationPostValidatePolicyBase.sol";

/// @title MaxConcentration Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Validates concentration limitations per asset for its equity of a particular fund
contract MaxConcentration is CallOnIntegrationPostValidatePolicyBase {
    using SafeMath for uint256;

    event MaxConcentrationSet(address policyManager, uint256 value);

    uint256 internal constant ONE_HUNDRED_PERCENT = 10**18; // 100%

    mapping(address => uint256) public policyManagerToMaxConcentration;

    constructor(address _registry) public PolicyBase(_registry) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial policy settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    /// @dev Only called once, on PolicyManager.enablePolicies()
    function addFundSettings(bytes calldata _encodedSettings) external override onlyPolicyManager {
        uint256 maxConcentration = abi.decode(_encodedSettings, (uint256));
        require(maxConcentration > 0, "addFundSettings: maxConcentration must be greater than 0");
        require(
            maxConcentration <= ONE_HUNDRED_PERCENT,
            "addFundSettings: maxConcentration cannot exceed 100%"
        );

        policyManagerToMaxConcentration[msg.sender] = maxConcentration;
        emit MaxConcentrationSet(msg.sender, maxConcentration);
    }

    /// @notice Provides a constant string identifier for a policy
    function identifier() external override pure returns (string memory) {
        return "MAX_CONCENTRATION";
    }

    // TODO: Use live rates instead of canonical rates for fund and asset GAV
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
        (, , address[] memory incomingAssets, , , ) = __decodeRuleArgs(_encodedArgs);
        Shares shares = Shares(__getShares());
        address denominationAsset = shares.DENOMINATION_ASSET();
        uint256 totalGav = shares.calcGav();
        uint256[] memory incomingAssetBalances = Vault(payable(__getVault())).getAssetBalances(
            incomingAssets
        );

        for (uint256 i = 0; i < incomingAssets.length; i++) {
            if (incomingAssets[i] == denominationAsset) continue;

            (uint256 assetGav, bool isValid) = ValueInterpreter(__getValueInterpreter())
                .calcCanonicalAssetValue(
                incomingAssets[i],
                incomingAssetBalances[i],
                denominationAsset
            );

            require(assetGav > 0 && isValid, "validateRule: No valid price available for asset");

            if (
                __calcConcentration(assetGav, totalGav) >
                policyManagerToMaxConcentration[msg.sender]
            ) return false;
        }

        return true;
    }

    // PRIVATE FUNCTIONS

    /// @notice Helper to calculate a percentage
    function __calcConcentration(uint256 _assetGav, uint256 _totalGav)
        private
        pure
        returns (uint256)
    {
        return _assetGav.mul(ONE_HUNDRED_PERCENT).div(_totalGav);
    }
}
