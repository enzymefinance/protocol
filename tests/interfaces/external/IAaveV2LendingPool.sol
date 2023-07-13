// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface IAaveV2LendingPool {
    struct ReserveConfigurationMap {
        //bit 0-15: LTV
        //bit 16-31: Liq. threshold
        //bit 32-47: Liq. bonus
        //bit 48-55: Decimals
        //bit 56: Reserve is active
        //bit 57: reserve is frozen
        //bit 58: borrowing is enabled
        //bit 59: stable rate borrowing enabled
        //bit 60-63: reserved
        //bit 64-79: reserve factor
        uint256 data;
    }

    struct ReserveData {
        //stores the reserve configuration
        ReserveConfigurationMap configuration;
        //the liquidity index. Expressed in ray
        uint128 liquidityIndex;
        //variable borrow index. Expressed in ray
        uint128 variableBorrowIndex;
        //the current supply rate. Expressed in ray
        uint128 currentLiquidityRate;
        //the current variable borrow rate. Expressed in ray
        uint128 currentVariableBorrowRate;
        //the current stable borrow rate. Expressed in ray
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        //tokens addresses
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        //address of the interest rate strategy
        address interestRateStrategyAddress;
        //the id of the reserve. Represents the position in the list of the active reserves
        uint8 id;
    }

    function borrow(address _underlying, uint256 _amount, uint256 _rateMode, uint16 _referralCode, address _to)
        external;

    function deposit(address _underlying, uint256 _amount, address _to, uint16 _referralCode) external;

    function getReserveData(address _asset) external view returns (ReserveData memory reserveData_);

    function repay(address _underlying, uint256 _amount, uint256 _rateMode, address _to)
        external
        returns (uint256 actualAmount_);

    function withdraw(address _underlying, uint256 _amount, address _to) external returns (uint256 actualAmount_);
}
