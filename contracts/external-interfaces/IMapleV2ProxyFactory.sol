// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IMapleV2ProxyFactory Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMapleV2ProxyFactory {
    function isInstance(address instance_) external view returns (bool isInstance_);
}
