// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager} from "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IUniswapV3Adapter} from "tests/interfaces/internal/IUniswapV3Adapter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

import {ETHEREUM_SWAP_ROUTER, POLYGON_SWAP_ROUTER, ARBITRUM_SWAP_ROUTER} from "./UniswapV3Utils.sol";

abstract contract TestBase is IntegrationTest {
    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IUniswapV3Adapter internal adapter;

    function __initialize(uint256 _chainId, address _routerAddress) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        adapter = __deployAdapter(_routerAddress);

        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        comptrollerProxyAddress = address(comptrollerProxy);
        vaultProxyAddress = address(vaultProxy);
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(address _routerAddress) private returns (IUniswapV3Adapter) {
        bytes memory args = abi.encode(address(core.release.integrationManager), _routerAddress);
        address addr = deployCode("UniswapV3Adapter.sol", args);
        return IUniswapV3Adapter(addr);
    }

    // ACTION HELPERS

    function __takeOrder(
        address[] memory _pathAddresses,
        uint24[] memory _pathFees,
        uint256 _outgoingAssetAmount,
        uint256 _minIncomingAssetAmount
    ) private {
        bytes memory actionArgs = abi.encode(_pathAddresses, _pathFees, _outgoingAssetAmount, _minIncomingAssetAmount);

        vm.prank(fundOwner);
        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _adapter: address(adapter),
            _selector: IUniswapV3Adapter.takeOrder.selector,
            _actionArgs: actionArgs
        });
    }

    // TESTS HELPERS

    function __test_takeOrder_success(
        address[] memory _pathAddresses,
        uint24[] memory _pathFees,
        uint256 _outgoingAssetAmount
    ) internal {
        address outgoingAsset = _pathAddresses[0];
        address incomingAsset = _pathAddresses[_pathAddresses.length - 1];

        // increase token balances so vault has enough funds to take order
        increaseTokenBalance({_token: IERC20(outgoingAsset), _to: vaultProxyAddress, _amount: _outgoingAssetAmount * 3});

        uint256 preOutgoingAssetBalance = IERC20(outgoingAsset).balanceOf(vaultProxyAddress);
        uint256 preIncomingAssetBalance = IERC20(incomingAsset).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __takeOrder({
            _pathAddresses: _pathAddresses,
            _pathFees: _pathFees,
            _outgoingAssetAmount: _outgoingAssetAmount,
            _minIncomingAssetAmount: 1
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManager.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(outgoingAsset),
            _maxSpendAssetAmounts: toArray(_outgoingAssetAmount),
            _incomingAssets: toArray(incomingAsset),
            _minIncomingAssetAmounts: toArray(uint256(1))
        });

        uint256 postOutgoingAssetBalance = IERC20(outgoingAsset).balanceOf(vaultProxyAddress);
        uint256 postIncomingAssetBalance = IERC20(incomingAsset).balanceOf(vaultProxyAddress);

        assertEq(
            postOutgoingAssetBalance, preOutgoingAssetBalance - _outgoingAssetAmount, "Incorrect outgoingAsset balance"
        );
        assertGe(postIncomingAssetBalance, preIncomingAssetBalance, "Incorrect incomingAsset balance");
    }

    function test_takeOrder_failsTooShortPathAddresses() public {
        vm.expectRevert("parseAssetsForAction: pathAddresses must be >= 2");

        __takeOrder({
            _pathAddresses: toArray(makeAddr("fake token")),
            _pathFees: new uint24[](0),
            _outgoingAssetAmount: 1,
            _minIncomingAssetAmount: 1
        });
    }

    function test_takeOrder_failsIncorrectPathAddressesAndPathFeesLength() public {
        vm.expectRevert("parseAssetsForAction: incorrect pathAddresses or pathFees length");

        __takeOrder({
            _pathAddresses: toArray(makeAddr("fake token 1"), makeAddr("fake token 2")),
            _pathFees: new uint24[](0),
            _outgoingAssetAmount: 1,
            _minIncomingAssetAmount: 1
        });
    }
}

contract UniswapV3AdapterEthereumTest is TestBase {
    function setUp() public override {
        __initialize({_chainId: ETHEREUM_CHAIN_ID, _routerAddress: ETHEREUM_SWAP_ROUTER});
    }

    function test_takeOrder_success() public {
        uint24[] memory pathFees = new uint24[](1);
        pathFees[0] = 3000;

        __test_takeOrder_success({
            _pathAddresses: toArray(ETHEREUM_WETH, ETHEREUM_USDC),
            _pathFees: pathFees,
            _outgoingAssetAmount: 4 * assetUnit(IERC20(ETHEREUM_WETH))
        });
    }

    function test_takeOrder_successMultiplePaths() public {
        uint24[] memory pathFees = new uint24[](2);
        pathFees[0] = 3000;
        pathFees[1] = 100;

        __test_takeOrder_success({
            _pathAddresses: toArray(ETHEREUM_WETH, ETHEREUM_USDC, ETHEREUM_DAI),
            _pathFees: pathFees,
            _outgoingAssetAmount: 9 * assetUnit(IERC20(ETHEREUM_WETH))
        });
    }
}

contract UniswapV3AdapterPolygonTest is TestBase {
    function setUp() public override {
        __initialize({_chainId: POLYGON_CHAIN_ID, _routerAddress: POLYGON_SWAP_ROUTER});
    }

    function test_takeOrder_success() public {
        uint24[] memory pathFees = new uint24[](1);
        pathFees[0] = 3000;

        __test_takeOrder_success({
            _pathAddresses: toArray(POLYGON_WMATIC, POLYGON_USDC),
            _pathFees: pathFees,
            _outgoingAssetAmount: 11 * assetUnit(IERC20(POLYGON_WMATIC))
        });
    }

    function test_takeOrder_successMultiplePaths() public {
        uint24[] memory pathFees = new uint24[](2);
        pathFees[0] = 100;
        pathFees[1] = 3000;

        __test_takeOrder_success({
            _pathAddresses: toArray(POLYGON_DAI, POLYGON_USDT, POLYGON_WMATIC),
            _pathFees: pathFees,
            _outgoingAssetAmount: 13 * assetUnit(IERC20(POLYGON_WMATIC))
        });
    }
}

contract UniswapV3AdapterArbitrumTest is TestBase {
    function setUp() public override {
        __initialize({_chainId: ARBITRUM_CHAIN_ID, _routerAddress: ARBITRUM_SWAP_ROUTER});
    }

    function test_takeOrder_success() public {
        uint24[] memory pathFees = new uint24[](1);
        pathFees[0] = 3000;

        __test_takeOrder_success({
            _pathAddresses: toArray(ARBITRUM_WETH, ARBITRUM_USDC),
            _pathFees: pathFees,
            _outgoingAssetAmount: 11 * assetUnit(IERC20(ARBITRUM_WETH))
        });
    }

    function test_takeOrder_successMultiplePaths() public {
        uint24[] memory pathFees = new uint24[](2);
        pathFees[0] = 100;
        pathFees[1] = 3000;

        __test_takeOrder_success({
            _pathAddresses: toArray(ARBITRUM_DAI, ARBITRUM_USDT, ARBITRUM_WETH),
            _pathFees: pathFees,
            _outgoingAssetAmount: 13 * assetUnit(IERC20(ARBITRUM_WETH))
        });
    }
}
