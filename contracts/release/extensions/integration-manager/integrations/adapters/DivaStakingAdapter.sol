// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IDivaEther} from "../../../../../external-interfaces/IDivaEther.sol";
import {GenericWrappingAdapterBase} from "../utils/0.8.19/bases/GenericWrappingAdapterBase.sol";

/// @title DivaStakingAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
contract DivaStakingAdapter is GenericWrappingAdapterBase {
    constructor(address _integrationManager, address _divEthAddress, address _wethAddress)
        GenericWrappingAdapterBase(_integrationManager, _divEthAddress, _wethAddress, true)
    {}

    /// @dev Logic to wrap ETH into divETH
    function __wrap(uint256) internal override {
        IDivaEther(address(DERIVATIVE)).deposit{value: address(this).balance}();
    }
}
