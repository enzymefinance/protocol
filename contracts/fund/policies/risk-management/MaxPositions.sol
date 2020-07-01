// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../vault/Vault.sol";
import "../utils/CallOnIntegrationPostValidatePolicyBase.sol";

/// @title MaxPositions Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Validates the allowed number of owned assets of a particular fund
contract MaxPositions is CallOnIntegrationPostValidatePolicyBase {
    event MaxPositionsSet(address policyManager, uint256 value);

    mapping (address => uint256) public policyManagerToMaxPositions;

    constructor(address _registry) public PolicyBase(_registry) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial policy settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    /// @dev Only called once, on PolicyManager.enablePolicies()
    function addFundSettings(bytes calldata _encodedSettings) external override onlyPolicyManager {
        uint256 maxPositions = abi.decode(_encodedSettings, (uint256));
        require(maxPositions > 1, "addFundSettings: maxPositions must be greater than 1");

        policyManagerToMaxPositions[msg.sender] = maxPositions;
        emit MaxPositionsSet(msg.sender, maxPositions);
    }

    /// @notice Provides a constant string identifier for a policy
    function identifier() external pure override returns (string memory) {
        return "MAX_POSITIONS";
    }

    /// @notice Apply the rule with specified paramters, in the context of a fund
    /// @return True if the rule passes
    /// @dev A fund's PolicyManager is always the sender
    function validateRule(bytes calldata)
        external
        override
        onlyPolicyManager
        returns (bool)
    {
        uint256 ownedAssetsCount = Vault(payable(__getVault())).getOwnedAssets().length;
        return ownedAssetsCount <= policyManagerToMaxPositions[msg.sender];
    }
}
