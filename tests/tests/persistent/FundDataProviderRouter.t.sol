// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDataProviderRouter} from "tests/interfaces/internal/IFundDataProviderRouter.sol";

contract FundDataProviderRouterTest is IntegrationTest {
    EnzymeVersion internal version = EnzymeVersion.Current;

    address internal comptrollerProxyAddress;
    IERC20 internal denominationAsset;
    address internal fundOwner;
    address internal vaultProxyAddress;

    uint256 depositAmount;
    IFundDataProviderRouter fundDataProviderRouter;

    function setUp() public override {
        setUpStandaloneEnvironment();

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion({_version: version});
        denominationAsset = IERC20(IComptrollerLib(comptrollerProxyAddress).getDenominationAsset());

        depositAmount = assetUnit(denominationAsset) * 21;

        // Buy some shares of the fund
        buySharesForVersion({
            _version: version,
            _sharesBuyer: fundOwner,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _amountToDeposit: depositAmount
        });

        fundDataProviderRouter = __deployFundDataProviderRouter();
    }

    function __deployFundDataProviderRouter() internal returns (IFundDataProviderRouter fundDataProviderRouter_) {
        bytes memory args = abi.encode(core.persistent.fundValueCalculatorRouter, address(wrappedNativeToken));

        return IFundDataProviderRouter(deployCode("FundDataProviderRouter.sol", args));
    }

    function test_fundDataProviderPrice_success() public {
        (
            uint256 timestamp,
            uint256 sharesSupply,
            uint256 gavInDenominationAsset,
            uint256 gavInEth,
            bool gavIsValid,
            uint256 navInDenominationAsset,
            uint256 navInEth,
            bool navIsValid,
            bool ethConversionIsValid_
        ) = fundDataProviderRouter.getFundValueMetrics({_vaultProxy: vaultProxyAddress});

        assertEq(timestamp, block.timestamp, "Timestamp should match block timestamp");
        assertEq(sharesSupply, depositAmount, "Shares supply should match deposit amount");
        assertEq(gavInDenominationAsset, depositAmount, "GAV in denomination asset should match deposit amount");
        assertGt(gavInEth, 0, "GAV in ETH should be greater than 0");
        assertTrue(gavIsValid, "GAV should be valid");
        assertEq(navInDenominationAsset, depositAmount, "NAV in denomination asset should match deposit amount");
        assertGt(navInEth, 0, "NAV in ETH should be greater than 0");
        assertTrue(navIsValid, "NAV should be valid");
        assertTrue(ethConversionIsValid_, "ETH conversion should be valid");
    }
}
