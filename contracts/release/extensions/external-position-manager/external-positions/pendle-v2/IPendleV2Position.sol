// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2Position Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IPendleV2Position is IExternalPosition {
    enum Actions {
        BuyPrincipalToken,
        SellPrincipalToken,
        AddLiquidity,
        RemoveLiquidity,
        ClaimRewards,
        MigrateToVault
    }

    function getLPTokens() external view returns (address[] memory lpTokenAddresses_);

    function getPrincipalTokens() external view returns (address[] memory principalTokenAddresses_);
}
