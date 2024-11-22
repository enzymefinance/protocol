/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title IMorphoBlue Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMorphoBlue {
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    struct Position {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    struct Market {
        uint128 totalSupplyAssets;
        uint128 totalSupplyShares;
        uint128 totalBorrowAssets;
        uint128 totalBorrowShares;
        uint128 lastUpdate;
        uint128 fee;
    }

    function flashLoan(address _token, uint256 _assets, bytes calldata _data) external;

    function supply(
        MarketParams memory _marketParams,
        uint256 _assets,
        uint256 _shares,
        address _onBehalf,
        bytes memory _data
    ) external returns (uint256 assetsSupplied_, uint256 sharesSupplied_);

    function withdraw(
        MarketParams memory _marketParams,
        uint256 _assets,
        uint256 _shares,
        address _onBehalf,
        address _receiver
    ) external returns (uint256 assetsWithdrawn_, uint256 sharesWithdrawn_);

    function borrow(
        MarketParams memory _marketParams,
        uint256 _assets,
        uint256 _shares,
        address _onBehalf,
        address _receiver
    ) external returns (uint256 assetsBorrowed_, uint256 sharesBorrowed_);

    function repay(
        MarketParams memory _marketParams,
        uint256 _assets,
        uint256 _shares,
        address _onBehalf,
        bytes memory _data
    ) external returns (uint256 assetsRepaid_, uint256 sharesRepaid_);

    function supplyCollateral(MarketParams memory _marketParams, uint256 _assets, address _onBehalf, bytes memory _data)
        external;

    function withdrawCollateral(
        MarketParams memory _marketParams,
        uint256 _assets,
        address _onBehalf,
        address _receiver
    ) external;

    function accrueInterest(MarketParams memory _marketParams) external;

    function idToMarketParams(bytes32 _id) external view returns (MarketParams memory marketParams_);

    function market(bytes32 _id) external view returns (Market memory market_);

    function position(bytes32 _id, address _user) external view returns (Position memory position_);
}
