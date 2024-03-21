// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ISwellSweth} from "../../../../../external-interfaces/ISwellSweth.sol";
import {GenericWrappingAdapterBase} from "../utils/0.8.19/bases/GenericWrappingAdapterBase.sol";

/// @title SwellStakingAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
contract SwellStakingAdapter is GenericWrappingAdapterBase {
    address immutable REFERRAL_ADDRESS;

    constructor(address _integrationManager, address _swethAddress, address _wethAddress, address _referralAddress)
        GenericWrappingAdapterBase(_integrationManager, _swethAddress, _wethAddress, true)
    {
        REFERRAL_ADDRESS = _referralAddress;
    }

    /// @dev Logic to wrap ETH into swETH
    function __wrap(uint256) internal override {
        ISwellSweth(address(DERIVATIVE)).depositWithReferral{value: address(this).balance}({_referral: REFERRAL_ADDRESS});
    }
}
