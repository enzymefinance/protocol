// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IStaderStakePoolsManager} from "../../../../../external-interfaces/IStaderStakePoolsManager.sol";
import {GenericWrappingAdapterBase} from "../utils/0.8.19/bases/GenericWrappingAdapterBase.sol";

/// @title StaderStakingAdapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for staking ETH for Stader ETHx
contract StaderStakingAdapter is GenericWrappingAdapterBase {
    IStaderStakePoolsManager public immutable STADER_STAKE_POOLS_MANAGER;

    constructor(
        address _integrationManager,
        address _staderStakePoolsManagerAddress,
        address _ethxAddress,
        address _wethAddress
    ) GenericWrappingAdapterBase(_integrationManager, _ethxAddress, _wethAddress, true) {
        STADER_STAKE_POOLS_MANAGER = IStaderStakePoolsManager(_staderStakePoolsManagerAddress);
    }

    /// @dev Logic to wrap ETH into ETHx
    function __wrap(uint256 _underlyingAmount) internal override {
        STADER_STAKE_POOLS_MANAGER.deposit{value: _underlyingAmount}({_receiver: address(this)});
    }
}
