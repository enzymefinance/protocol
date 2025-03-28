// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IEnzymeVaultPriceFeed} from "tests/interfaces/internal/IEnzymeVaultPriceFeed.sol";
import {IFundValueCalculatorRouter} from "tests/interfaces/internal/IFundValueCalculatorRouter.sol";

abstract contract EnzymeVaultPriceFeedTestBase is IntegrationTest {
    ///@dev Shares unit for the Enzyme Vault
    uint256 private constant SHARES_UNIT = 10 ** 18;

    IEnzymeVaultPriceFeed internal priceFeed;

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;
    IERC20 internal denominationAsset;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version) internal {
        version = _version;

        denominationAsset = createTestToken(6);

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) =
            createTradingFundForVersion({_version: version, _denominationAsset: denominationAsset});

        priceFeed = __deployPriceFeed();
    }

    //==================================================================================================================
    // Deployment helpers
    //==================================================================================================================

    function __deployPriceFeed() private returns (IEnzymeVaultPriceFeed) {
        address addr = deployCode(
            "EnzymeVaultPriceFeed.sol",
            abi.encode(core.persistent.dispatcher, core.persistent.fundValueCalculatorRouter)
        );
        return IEnzymeVaultPriceFeed(addr);
    }

    //==================================================================================================================
    // Tests
    //==================================================================================================================

    /// @dev
    function test_calcUnderlyingValues_successInitialDeposit() public {
        // Buy shares so vault holds some value
        buySharesForVersion({
            _sharesBuyer: fundOwner,
            _amountToDeposit: 12 * assetUnit(denominationAsset),
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _version: version
        });

        uint256 sharesUnitsAmount = 2;
        uint256 derivativeAmount = sharesUnitsAmount * SHARES_UNIT;

        (address[] memory underlyings, uint256[] memory underlyingAmounts) =
            priceFeed.calcUnderlyingValues({_derivative: vaultProxyAddress, _derivativeAmount: derivativeAmount});

        (, uint256 netShareValue) =
            IFundValueCalculatorRouter(core.persistent.fundValueCalculatorRouter).calcNetShareValue(vaultProxyAddress);

        assertEq(underlyings, toArray(address(denominationAsset)), "Underlyings not as expected");
        assertEq(underlyingAmounts, toArray(netShareValue * sharesUnitsAmount), "UnderlyingAmounts not as expected");
        assertEq(underlyingAmounts, toArray(2_000_000), "Explicit underlyingAmounts not as expected");

        // For the initial deposit underlyingAmounts should be equal to the proportion of the derivativeAmount to the vault's total supply of shares
        assertEq(
            underlyingAmounts[0],
            derivativeAmount * denominationAsset.balanceOf(vaultProxyAddress) / IERC20(vaultProxyAddress).totalSupply()
        );
    }

    function test_calcUnderlyingValues_successEmptyVault() public {
        (address[] memory underlyings, uint256[] memory underlyingAmounts) =
            priceFeed.calcUnderlyingValues({_derivative: vaultProxyAddress, _derivativeAmount: 100});

        assertEq(underlyings, toArray(address(denominationAsset)), "Underlyings not as expected");
        // For the empty vault underlyingAmounts should be always equal to 0
        assertEq(underlyingAmounts, toArray(uint256(0)), "UnderlyingAmounts not as expected");
    }

    function test_isSupportedAsset_success() public {
        assertTrue(priceFeed.isSupportedAsset(vaultProxyAddress));
    }

    function test_isSupportedAsset_fails() public {
        assertFalse(priceFeed.isSupportedAsset(makeAddr("invalidVaultProxyAddress")));
    }
}

contract EnzymeVaultPriceFeedTestStandalone is EnzymeVaultPriceFeedTestBase {
    function setUp() public override {
        setUpStandaloneEnvironment();

        __initialize(EnzymeVersion.Current);
    }
}

contract EnzymeVaultPriceFeedTestEthereumV4 is EnzymeVaultPriceFeedTestBase {
    function setUp() public override {
        setUpLiveMainnetEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

contract EnzymeVaultPriceFeedTestPolygonV4 is EnzymeVaultPriceFeedTestBase {
    function setUp() public override {
        setUpLivePolygonEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

contract EnzymeVaultPriceFeedTestArbitrumV4 is EnzymeVaultPriceFeedTestBase {
    function setUp() public override {
        setUpLiveArbitrumEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

contract EnzymeVaultPriceFeedTestBaseChainV4 is EnzymeVaultPriceFeedTestBase {
    function setUp() public override {
        setUpLiveBaseChainEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}
