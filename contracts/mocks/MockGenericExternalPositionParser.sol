// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/extensions/external-position-manager/external-positions/IExternalPositionParser.sol";

/// @title MockGenericExternalPositionParser Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Provides a generic external position parser to be used on tests
contract MockGenericExternalPositionParser is IExternalPositionParser {
    struct AssetsForAction {
        address[] assetsToTransfer;
        uint256[] amountsToTransfer;
        address[] assetsToReceive;
    }

    bytes private initArgs;

    mapping(uint256 => AssetsForAction) private actionIdToAssetsForAction;

    /// @dev Returns the default assetsForAction stored for a given actionID
    function parseAssetsForAction(uint256 _actionId, bytes memory)
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        AssetsForAction memory assetsForAction = actionIdToAssetsForAction[_actionId];
        return (
            assetsForAction.assetsToTransfer,
            assetsForAction.amountsToTransfer,
            assetsForAction.assetsToReceive
        );
    }

    /// @dev Sets the assets for action for a given actionId
    function setAssetsForAction(
        uint256 actionId,
        address[] memory _assetsToTransfer,
        uint256[] memory _amountsToTransfer,
        address[] memory _assetsToReceive
    ) external {
        actionIdToAssetsForAction[actionId] = AssetsForAction({
            assetsToTransfer: _assetsToTransfer,
            amountsToTransfer: _amountsToTransfer,
            assetsToReceive: _assetsToReceive
        });
    }

    /// @dev Sets the initArgs variable
    function setInitArgs(bytes memory _initArgs) external {
        initArgs = _initArgs;
    }

    /// @dev Sets the initArgs variable
    function parseInitArgs(address, bytes memory)
        external
        override
        returns (bytes memory initArgs_)
    {
        return initArgs;
    }

    /// @dev Returns the initArgs variable
    function getInitArgs() public view returns (bytes memory initArgs_) {
        return initArgs;
    }
}
