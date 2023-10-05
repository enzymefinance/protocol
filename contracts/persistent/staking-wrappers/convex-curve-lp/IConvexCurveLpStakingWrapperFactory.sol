// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IDispatcherOwnedBeacon} from "../../../utils/0.8.19/dispatcher-owned-beacon/IDispatcherOwnedBeacon.sol";

/// @title IConvexCurveLpStakingWrapperFactory Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IConvexCurveLpStakingWrapperFactory is IDispatcherOwnedBeacon {
    function deploy(uint256 _pid) external returns (address wrapperProxy_);

    function getCurveLpTokenForWrapper(address _wrapper) external view returns (address lpToken_);

    function getWrapperForConvexPool(uint256 _pid) external view returns (address wrapper_);

    function pauseWrappers(address[] calldata _wrappers) external;

    function unpauseWrappers(address[] calldata _wrappers) external;
}
