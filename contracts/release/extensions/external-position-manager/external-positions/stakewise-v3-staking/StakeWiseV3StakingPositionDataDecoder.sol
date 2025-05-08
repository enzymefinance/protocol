// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IStakeWiseV3EthVault} from "../../../../../external-interfaces/IStakeWiseV3EthVault.sol";
import {IStakeWiseV3StakingPosition} from "./IStakeWiseV3StakingPosition.sol";

/// @title StakeWiseV3StakingPositionDataDecoder Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for StakeWiseV3StakingPosition payloads
abstract contract StakeWiseV3StakingPositionDataDecoder {
    /// @dev Helper to decode args used during the Stake action
    function __decodeStakeActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (IStakeWiseV3EthVault vaultToken_, uint256 assetAmount_)
    {
        return abi.decode(_actionArgs, (IStakeWiseV3EthVault, uint256));
    }

    /// @dev Helper to decode args used during the EnterExitQueue action
    function __decodeEnterExitQueueActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (IStakeWiseV3EthVault vaultToken_, uint256 sharesAmount_)
    {
        return abi.decode(_actionArgs, (IStakeWiseV3EthVault, uint256));
    }

    /// @dev Helper to decode args used during the ClaimExitedAssets action
    function __decodeClaimExitedAssetsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (IStakeWiseV3EthVault vaultToken_, uint256 positionTicket_, uint256 timestamp_)
    {
        return abi.decode(_actionArgs, (IStakeWiseV3EthVault, uint256, uint256));
    }
}
