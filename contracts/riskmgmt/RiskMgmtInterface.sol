pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';

/// @title RiskMgmtInterface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying RiskMgmt Contract
contract RiskMgmtInterface {
    /* Remark: Checks for:
     *  1) Liquidity: All positions have to be fairly simple to liquidate.
     *    E.g. Cap at percentage of 30 day average trading volume of this pair
     *  2) Market Impact: If w/in above liquidity restrictions, trade size also
     *    restricted to have market impact below certain threshold
     */
    function isExchangeMakePermitted(
        ERC20   haveToken,
        ERC20   wantToken,
        uint    haveAmount,
        uint    wantAmount
    )
        returns (bool)
    {}

    /* Remark: Checks for:
     *  1) Liquidity: All positions have to be fairly simple to liquidate.
     *    E.g. Cap at percentage of 30 day average trading volume of this pair
     *  2) Market Impact: If w/in above liquidity restrictions, trade size also
     *    restricted to have market impact below certain threshold
     */
    function isExchangeTakePermitted(
        ERC20   haveToken,
        ERC20   wantToken,
        uint    haveAmount,
        uint    wantAmount,
        address orderOwner
    )
        returns (bool)
    {}
}
