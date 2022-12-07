// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/interfaces/IMapleV2ProxyFactory.sol";

/// @title MockMapleV2PoolFactoryIntegratee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An integratee that simulates interactions with Maple v2 Pool Factories
contract MockMapleV2PoolFactoryIntegratee is IMapleV2ProxyFactory {
    address public immutable VALID_PROXY;

    constructor(address _validProxy) public {
        VALID_PROXY = _validProxy;
    }

    function isInstance(address _who) external view override returns (bool isInstance_) {
        return _who == VALID_PROXY;
    }
}
