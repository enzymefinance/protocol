// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2Position Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2Position is IExternalPosition {
    enum Actions {
        BuyPrincipalToken,
        SellPrincipalToken,
        AddLiquidity,
        RemoveLiquidity,
        ClaimRewards
    }

    function getMarketForPrincipalToken(address _principalTokenAddress)
        external
        view
        returns (address marketAddress_);

    function getOraclePricingDurationForMarket(address _marketAddress)
        external
        view
        returns (uint32 pricingDuration_);

    function getLPTokens() external view returns (address[] memory lpTokenAddresses_);

    function getPrincipalTokens() external view returns (address[] memory principalTokenAddresses_);
}
