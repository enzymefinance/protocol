// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {ICompoundV2CERC20 as ICERC20} from "tests/interfaces/external/ICompoundV2CERC20.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {ICompoundAdapter} from "tests/interfaces/internal/ICompoundAdapter.sol";
import {ICompoundPriceFeed} from "tests/interfaces/internal/ICompoundPriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

import {ETHEREUM_COMPTROLLER} from "./CompoundV2Constants.sol";

abstract contract CompoundV2TestBase is IntegrationTest {
    uint256 internal constant SCALED_RATE_PRECISION = 10 ** 18;

    address internal vaultOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    ICompoundAdapter internal adapter;
    ICompoundPriceFeed internal priceFeed;

    address internal cETHAddress = ETHEREUM_COMPOUND_V2_CETH;
    IERC20 internal comp = IERC20(ETHEREUM_COMP);
    address internal compoundComptrollerAddress = ETHEREUM_COMPTROLLER;
    ICERC20 internal regular18DecimalCToken = ICERC20(cETHAddress);
    ICERC20 internal non18DecimalCToken = ICERC20(ETHEREUM_COMPOUND_V2_CUSDC);

    // Set by child contract
    EnzymeVersion internal version;

    function setUp() public virtual override {
        setUpMainnetEnvironment();

        (comptrollerProxyAddress, vaultProxyAddress, vaultOwner) = createTradingFundForVersion(version);

        priceFeed = __deployCompoundPriceFeed({
            _fundDeployerAddress: getFundDeployerAddressForVersion(version),
            _wethToken: wethToken,
            _cETH: cETHAddress
        });

        adapter = __deployAdapter({
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(version),
            _compoundPriceFeed: priceFeed,
            _wethToken: wethToken
        });

        // Dependent on priceFeed deployment
        __registerCTokensAndUnderlyings(toArray(address(non18DecimalCToken), address(regular18DecimalCToken)));
    }

    // DEPLOYMENT HELPERS
    function __deployAdapter(
        address _integrationManagerAddress,
        ICompoundPriceFeed _compoundPriceFeed,
        IERC20 _wethToken
    ) internal returns (ICompoundAdapter adapter_) {
        bytes memory args = abi.encode(_integrationManagerAddress, _compoundPriceFeed, _wethToken);
        return ICompoundAdapter(payable(deployCode("CompoundAdapter.sol", args)));
    }

    function __deployCompoundPriceFeed(address _fundDeployerAddress, IERC20 _wethToken, address _cETH)
        internal
        returns (ICompoundPriceFeed priceFeed_)
    {
        bytes memory args = abi.encode(_fundDeployerAddress, _wethToken, _cETH);
        return ICompoundPriceFeed(deployCode("CompoundPriceFeed.sol", args));
    }

    // ACTION HELPERS

    function __lend(address _cToken, uint256 _underlyingAmount, uint256 _minCTokenAmount) internal {
        bytes memory actionArgs = abi.encode(_cToken, _underlyingAmount, _minCTokenAmount);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICompoundAdapter.lend.selector,
            _actionArgs: actionArgs
        });
    }

    function __redeem(address _cToken, uint256 _cTokenAmount, uint256 _minUnderlyingAmount) internal {
        bytes memory actionArgs = abi.encode(_cToken, _cTokenAmount, _minUnderlyingAmount);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICompoundAdapter.redeem.selector,
            _actionArgs: actionArgs
        });
    }

    function __claimRewards(address[] memory _cTokens, address _compoundComptroller) internal {
        bytes memory actionArgs = abi.encode(_cTokens, _compoundComptroller);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICompoundAdapter.claimRewards.selector,
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __getCTokenUnderlying(ICERC20 _cToken) internal returns (address underlying_) {
        return address(_cToken) == cETHAddress ? address(wethToken) : _cToken.underlying();
    }

    function __registerCTokensAndUnderlyings(address[] memory _cTokens) internal {
        for (uint256 i = 0; i < _cTokens.length; i++) {
            if (version == EnzymeVersion.V4) {
                v4AddPrimitiveWithTestAggregator({
                    _tokenAddress: __getCTokenUnderlying(ICERC20(_cTokens[i])),
                    _skipIfRegistered: true
                });
            }

            // cETH is already registered in the CompoundPriceFeed constructor
            if (_cTokens[i] != cETHAddress) {
                vm.prank(IFundDeployer(getFundDeployerAddressForVersion(version)).getOwner());

                ICompoundPriceFeed(priceFeed).addCTokens(toArray(_cTokens[i]));
            }

            addDerivative({
                _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
                _tokenAddress: _cTokens[i],
                _skipIfRegistered: true,
                _priceFeedAddress: address(priceFeed)
            });
        }
    }

    // inspired by https://docs.compound.finance/v2/#protocol-math
    function __underlyingToCToken(uint256 _underlyingAmount, uint256 _exchangeRateStored)
        internal
        pure
        returns (uint256 cTokenAmount_)
    {
        return _underlyingAmount * SCALED_RATE_PRECISION / _exchangeRateStored;
    }

    // inspired by https://docs.compound.finance/v2/#protocol-math
    function __cTokenToUnderlying(uint256 _cTokenAmount, uint256 _exchangeRateStored)
        internal
        pure
        returns (uint256 underlyingAmount_)
    {
        return (_cTokenAmount * _exchangeRateStored) / SCALED_RATE_PRECISION;
    }
}

abstract contract CompoundV2AdapterLendTest is CompoundV2TestBase {
    function __test_lend_success(address _cToken, uint256 _underlyingAmount) internal {
        address underlying = __getCTokenUnderlying(ICERC20(_cToken));
        // Arbitrary minIncomingAssetAmount
        uint256 minCTokenAmount = 123;

        increaseTokenBalance({_token: IERC20(underlying), _to: vaultProxyAddress, _amount: _underlyingAmount});

        vm.recordLogs();

        __lend({_cToken: _cToken, _underlyingAmount: _underlyingAmount, _minCTokenAmount: minCTokenAmount});

        // test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(underlying),
            _maxSpendAssetAmounts: toArray(_underlyingAmount),
            _incomingAssets: toArray(_cToken),
            _minIncomingAssetAmounts: toArray(minCTokenAmount)
        });

        // Immediately after the lend tx,
        // the exchangeRateStored is the exact exchange rate that was used
        uint256 exchangeRateStored = ICERC20(_cToken).exchangeRateStored();
        uint256 expectedCTokenAmount =
            __underlyingToCToken({_exchangeRateStored: exchangeRateStored, _underlyingAmount: _underlyingAmount});

        // confirm the cToken amount received by the vault
        uint256 vaultCTokenBalance = IERC20(_cToken).balanceOf(vaultProxyAddress);
        assertEq(vaultCTokenBalance, expectedCTokenAmount, "Not enough cToken received");
    }

    function test_lend_failsInvalidCToken() public {
        // create fake cToken
        IERC20 fakeCToken = createTestToken("Fake CToken");

        vm.expectRevert("__parseAssetsForLend: Unsupported cToken");

        __lend({_cToken: address(fakeCToken), _underlyingAmount: 1, _minCTokenAmount: 1});
    }
}

abstract contract CompoundV2AdapterRedeemTest is CompoundV2TestBase {
    function __test_redeem_success(address _cToken, uint256 _cTokenAmount) internal {
        address underlying = __getCTokenUnderlying(ICERC20(_cToken));
        // Arbitrary minIncomingAssetAmount
        uint256 minUnderlyingAmount = 123;

        increaseTokenBalance({_token: IERC20(_cToken), _to: vaultProxyAddress, _amount: _cTokenAmount});

        uint256 underlyingBalanceBeforeRedeem = IERC20(underlying).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __redeem({_cToken: _cToken, _cTokenAmount: _cTokenAmount, _minUnderlyingAmount: minUnderlyingAmount});

        // test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(_cToken),
            _maxSpendAssetAmounts: toArray(_cTokenAmount),
            _incomingAssets: toArray(underlying),
            _minIncomingAssetAmounts: toArray(minUnderlyingAmount)
        });

        // Immediately after the redeem tx,
        // the exchangeRateStored is the exact exchange rate that was used
        uint256 exchangeRateStored = ICERC20(_cToken).exchangeRateStored();
        uint256 expectedUnderlyingAmount =
            __cTokenToUnderlying({_exchangeRateStored: exchangeRateStored, _cTokenAmount: _cTokenAmount});

        // confirm the cToken amount received by the vault
        uint256 underlyingBalanceAfterRedeem = IERC20(underlying).balanceOf(vaultProxyAddress);
        assertEq(
            underlyingBalanceAfterRedeem,
            underlyingBalanceBeforeRedeem + expectedUnderlyingAmount,
            "Not enough underlying received"
        );
    }

    function test_redeem_failsInvalidCToken() public {
        // create fake cToken
        IERC20 fakeCToken = createTestToken("Fake CToken");

        vm.expectRevert("__parseAssetsForRedeem: Unsupported cToken");

        // try to redeem
        __redeem({_cToken: address(fakeCToken), _cTokenAmount: 1, _minUnderlyingAmount: 1});
    }
}

abstract contract CompoundV2AdapterClaimRewardsTest is CompoundV2TestBase {
    function __test_claimRewards_success(address[] memory _cTokens) internal {
        for (uint256 i = 0; i < _cTokens.length; i++) {
            address cToken = _cTokens[i];

            increaseTokenBalance({
                _token: IERC20(cToken),
                _to: vaultProxyAddress,
                _amount: 10 * assetUnit(IERC20(_cTokens[i]))
            });
        }

        // accrue some rewards during the time
        skip(180 days);

        uint256 preTxCompBalance = comp.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __claimRewards({_cTokens: _cTokens, _compoundComptroller: compoundComptrollerAddress});

        // Test parseAssetsForAction encoding.
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.None),
            _spendAssets: new address[](0),
            _maxSpendAssetAmounts: new uint256[](0),
            _incomingAssets: new address[](0),
            _minIncomingAssetAmounts: new uint256[](0)
        });

        // confirm comp was transferred to vault
        assertGt(
            comp.balanceOf(vaultProxyAddress),
            preTxCompBalance,
            "ClaimRewards should have transferred comp to vault, but did not"
        );
    }
}

contract CompoundV2AdapterTestEthereum is
    CompoundV2AdapterLendTest,
    CompoundV2AdapterRedeemTest,
    CompoundV2AdapterClaimRewardsTest
{
    function test_lend_success() public {
        __test_lend_success({
            _cToken: address(regular18DecimalCToken),
            _underlyingAmount: 10 * assetUnit(IERC20(__getCTokenUnderlying(regular18DecimalCToken)))
        });

        __test_lend_success({
            _cToken: address(non18DecimalCToken),
            _underlyingAmount: 60 * assetUnit(IERC20(__getCTokenUnderlying(non18DecimalCToken)))
        });
    }

    function test_redeem_success() public {
        __test_redeem_success({
            _cToken: address(regular18DecimalCToken),
            _cTokenAmount: 10 * assetUnit(IERC20(address(regular18DecimalCToken)))
        });

        __test_redeem_success({
            _cToken: address(non18DecimalCToken),
            _cTokenAmount: 60 * assetUnit(IERC20(address(non18DecimalCToken)))
        });
    }

    function test_claimRewards_success() public {
        __test_claimRewards_success({_cTokens: toArray(address(regular18DecimalCToken), address(non18DecimalCToken))});
    }
}

contract CompoundV2AdapterTestEthereumV4 is CompoundV2AdapterTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}
