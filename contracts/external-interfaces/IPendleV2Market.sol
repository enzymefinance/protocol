// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IPendleV2PrincipalToken} from "./IPendleV2PrincipalToken.sol";
import {IPendleV2StandardizedYield} from "./IPendleV2StandardizedYield.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2Market Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2Market {
    function factory() external view returns (address factoryAddress_);

    function getRewardTokens() external view returns (address[] memory rewardTokenAddresses_);

    function readTokens()
        external
        view
        returns (IPendleV2StandardizedYield sy_, IPendleV2PrincipalToken pt_, address yt_);

    function redeemRewards(address _user) external returns (uint256[] memory rewardAmounts_);
}
