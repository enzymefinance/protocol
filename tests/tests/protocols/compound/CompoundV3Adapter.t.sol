// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ICompoundV3Comet} from "tests/interfaces/external/ICompoundV3Comet.sol";
import {ICompoundV3CometRewards} from "tests/interfaces/external/ICompoundV3CometRewards.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {ICompoundV3Adapter} from "tests/interfaces/internal/ICompoundV3Adapter.sol";
import {ICompoundV3CTokenListOwner} from "tests/interfaces/internal/ICompoundV3CTokenListOwner.sol";

import {
    ETHEREUM_COMPOUND_V3_CONFIGURATOR,
    ETHEREUM_COMPOUND_V3_REWARDS,
    POLYGON_COMPOUND_V3_CONFIGURATOR,
    POLYGON_COMPOUND_V3_REWARDS
} from "./CompoundV3Constants.sol";

abstract contract CompoundV3TestBase is IntegrationTest {
    IERC20 internal regular18DecimalCToken;
    IERC20 internal non18DecimalCToken;

    uint256 internal constant ROUNDING_BUFFER = 2;

    address internal vaultOwner;

    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    ICompoundV3Adapter internal adapter;
    address internal compoundV3ConfiguratorAddress;
    ICompoundV3CometRewards internal compoundV3Rewards;

    // Set by child contract
    EnzymeVersion internal version;

    function setUp() public virtual override {
        (comptrollerProxyAddress, vaultProxyAddress, vaultOwner) = createTradingFundForVersion(version);

        (, uint256 cTokenListId) = __deployCompoundV3CTokenListOwner({
            _addressListRegistry: core.persistent.addressListRegistry,
            _compoundV3Configurator: compoundV3ConfiguratorAddress
        });

        adapter = __deployAdapter({
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(version),
            _compoundV3Configurator: compoundV3ConfiguratorAddress,
            _compoundV3Rewards: compoundV3Rewards,
            _addressListRegistry: core.persistent.addressListRegistry,
            _cTokenListId: cTokenListId
        });
    }

    // DEPLOYMENT HELPERS
    function __deployAdapter(
        address _integrationManagerAddress,
        address _compoundV3Configurator,
        ICompoundV3CometRewards _compoundV3Rewards,
        IAddressListRegistry _addressListRegistry,
        uint256 _cTokenListId
    ) internal returns (ICompoundV3Adapter adapter_) {
        bytes memory args = abi.encode(
            _integrationManagerAddress, _compoundV3Configurator, _compoundV3Rewards, _addressListRegistry, _cTokenListId
        );
        return ICompoundV3Adapter(deployCode("CompoundV3Adapter.sol", args));
    }

    function __deployCompoundV3CTokenListOwner(
        IAddressListRegistry _addressListRegistry,
        address _compoundV3Configurator
    ) internal returns (ICompoundV3CTokenListOwner cTokenListOwner_, uint256 cTokenListId_) {
        uint256 cTokenListId = _addressListRegistry.getListCount();

        string memory listDescription = "";
        bytes memory args = abi.encode(_addressListRegistry, listDescription, _compoundV3Configurator);
        address addr = deployCode("CompoundV3CTokenListOwner.sol", args);
        return (ICompoundV3CTokenListOwner(addr), cTokenListId);
    }

    // ACTION HELPERS
    function __claimRewards(address[] memory _cTokens) internal {
        bytes memory actionArgs = abi.encode(_cTokens);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICompoundV3Adapter.claimRewards.selector,
            _actionArgs: actionArgs
        });
    }

    function __lend(address _cToken, uint256 _underlyingAmount) internal {
        bytes memory actionArgs = abi.encode(_cToken, _underlyingAmount);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICompoundV3Adapter.lend.selector,
            _actionArgs: actionArgs
        });
    }

    function __redeem(address _cToken, uint256 _amount) internal {
        bytes memory actionArgs = abi.encode(_cToken, _amount);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICompoundV3Adapter.redeem.selector,
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __v4registerCTokensAndUnderlyings(address[] memory _cTokens) internal {
        for (uint256 i = 0; i < _cTokens.length; i++) {
            v4AddPrimitiveWithTestAggregator({_tokenAddress: _cTokens[i], _skipIfRegistered: true});

            v4AddPrimitiveWithTestAggregator({
                _tokenAddress: ICompoundV3Comet(_cTokens[i]).baseToken(),
                _skipIfRegistered: true
            });
        }
    }
}

abstract contract CompoundV3LendTest is CompoundV3TestBase {
    function __test_lend_success(address _cToken, uint256 _underlyingAmount) internal {
        address underlying = ICompoundV3Comet(_cToken).baseToken();

        increaseTokenBalance({_token: IERC20(underlying), _to: vaultProxyAddress, _amount: _underlyingAmount});

        vm.recordLogs();

        __lend({_cToken: _cToken, _underlyingAmount: _underlyingAmount});

        // Test parseAssetsForAction encoding.
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(underlying),
            _maxSpendAssetAmounts: toArray(_underlyingAmount),
            _incomingAssets: toArray(_cToken),
            _minIncomingAssetAmounts: toArray(_underlyingAmount - ROUNDING_BUFFER)
        });

        assertApproxEqAbs(
            IERC20(_cToken).balanceOf(vaultProxyAddress),
            _underlyingAmount,
            ROUNDING_BUFFER,
            "CToken balance of vault after lend is incorrect"
        );
    }
}

abstract contract CompoundV3RedeemTest is CompoundV3TestBase {
    function __test_redeem_success(address _cToken, uint256 _cTokenAmount) internal {
        address underlying = ICompoundV3Comet(_cToken).baseToken();

        increaseTokenBalance({
            _token: IERC20(_cToken),
            _to: vaultProxyAddress,
            // sometime 1 wei less can be created, so we add ROUNDING_BUFFER
            _amount: _cTokenAmount + ROUNDING_BUFFER
        });

        // balance of vault before redeem
        uint256 vaultBalanceBefore = IERC20(underlying).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __redeem({_cToken: _cToken, _amount: _cTokenAmount});

        // Test parseAssetsForAction encoding.
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(_cToken),
            _maxSpendAssetAmounts: toArray(_cTokenAmount),
            _incomingAssets: toArray(underlying),
            _minIncomingAssetAmounts: toArray(_cTokenAmount - ROUNDING_BUFFER)
        });

        // balance of vault after redeem
        uint256 vaultBalanceAfter = IERC20(underlying).balanceOf(vaultProxyAddress);

        // balance of vault should be increased by _amount
        assertApproxEqAbs(
            vaultBalanceBefore + _cTokenAmount,
            vaultBalanceAfter,
            ROUNDING_BUFFER,
            "Underlying vault balance after redeem is incorrect"
        );
    }
}

abstract contract CompoundV3ClaimRewardsTest is CompoundV3TestBase {
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

        vm.recordLogs();

        // rewards balances before claim
        uint256[] memory rewardsBalancesBefore = new uint256[](_cTokens.length);
        for (uint256 i = 0; i < _cTokens.length; i++) {
            address rewardToken = compoundV3Rewards.rewardConfig(_cTokens[i]).token;
            rewardsBalancesBefore[i] = IERC20(rewardToken).balanceOf(vaultProxyAddress);
        }

        __claimRewards(_cTokens);

        // Test parseAssetsForAction encoding.
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.None),
            _spendAssets: new address[](0),
            _maxSpendAssetAmounts: new uint256[](0),
            _incomingAssets: new address[](0),
            _minIncomingAssetAmounts: new uint256[](0)
        });

        for (uint256 i = 0; i < _cTokens.length; i++) {
            address rewardToken = compoundV3Rewards.rewardConfig(_cTokens[i]).token;
            uint256 rewardAmount = IERC20(rewardToken).balanceOf(vaultProxyAddress);
            // check that some amount of reward token was claimed and transferred to the vault
            assertGt(rewardAmount, rewardsBalancesBefore[i], "No rewards claimed");
        }
    }
}

abstract contract CompoundV3Test is CompoundV3LendTest, CompoundV3RedeemTest, CompoundV3ClaimRewardsTest {}

contract CompoundV3TestEthereum is CompoundV3Test {
    function setUp() public virtual override {
        compoundV3ConfiguratorAddress = ETHEREUM_COMPOUND_V3_CONFIGURATOR;
        compoundV3Rewards = ICompoundV3CometRewards(ETHEREUM_COMPOUND_V3_REWARDS);

        setUpMainnetEnvironment();

        regular18DecimalCToken = IERC20(ETHEREUM_COMPOUND_V3_CWETH);
        non18DecimalCToken = IERC20(ETHEREUM_COMPOUND_V3_CUSDC);

        super.setUp();
    }

    function test_lend_success() public {
        __test_lend_success({_cToken: address(non18DecimalCToken), _underlyingAmount: 6 * assetUnit(non18DecimalCToken)});

        __test_lend_success({
            _cToken: address(regular18DecimalCToken),
            _underlyingAmount: 10 * assetUnit(IERC20(regular18DecimalCToken))
        });
    }

    function test_redeem_success() public {
        __test_redeem_success({_cToken: address(non18DecimalCToken), _cTokenAmount: 6 * assetUnit(non18DecimalCToken)});

        __test_redeem_success({
            _cToken: address(regular18DecimalCToken),
            _cTokenAmount: 10 * assetUnit(regular18DecimalCToken)
        });
    }

    function test_claimRewards_success() public {
        __test_claimRewards_success(toArray(address(regular18DecimalCToken), address(non18DecimalCToken)));
    }
}

contract CompoundV3TestPolygon is CompoundV3Test {
    function setUp() public virtual override {
        compoundV3ConfiguratorAddress = POLYGON_COMPOUND_V3_CONFIGURATOR;
        compoundV3Rewards = ICompoundV3CometRewards(POLYGON_COMPOUND_V3_REWARDS);

        setUpPolygonEnvironment();

        non18DecimalCToken = IERC20(POLYGON_COMPOUND_V3_CUSDC);

        super.setUp();
    }

    function test_lend_success() public {
        __test_lend_success({_cToken: address(non18DecimalCToken), _underlyingAmount: 6 * assetUnit(non18DecimalCToken)});
    }

    function test_redeem_success() public {
        __test_redeem_success({_cToken: address(non18DecimalCToken), _cTokenAmount: 6 * assetUnit(non18DecimalCToken)});
    }

    function test_claimRewards_success() public {
        __test_claimRewards_success(toArray(address(non18DecimalCToken)));
    }
}

contract CompoundV3TestEthereumV4 is CompoundV3TestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();

        __v4registerCTokensAndUnderlyings(toArray(address(non18DecimalCToken), address(regular18DecimalCToken)));
    }
}

contract CompoundV3TestPolygonV4 is CompoundV3TestPolygon {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();

        __v4registerCTokensAndUnderlyings(toArray(address(non18DecimalCToken)));
    }
}
