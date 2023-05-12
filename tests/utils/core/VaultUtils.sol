// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IMigrationHookHandler} from "tests/interfaces/internal/IMigrationHookHandler.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

enum MigrationOutHook {
    PreSignal,
    PostSignal,
    PreMigrate,
    PostMigrate,
    PostCancel
}

abstract contract VaultUtils is Test {
    function seedVault(IVault _vaultProxy, IERC20 _dealToken, uint256 _dealAmount) internal {
        deal(address(_vaultProxy), address(_dealToken), _dealAmount);
    }

    function predictVaultProxyAddress(IDispatcher _dispatcher) internal view returns (address) {
        return computeCreateAddress(address(_dispatcher), vm.getNonce(address(_dispatcher)));
    }

    function predictComptrollerProxyAddress(IFundDeployer _fundDeployer) internal view returns (address) {
        return computeCreateAddress(address(_fundDeployer), vm.getNonce(address(_fundDeployer)));
    }

    function createVault(
        IFundDeployer _fundDeployer,
        address _vaultOwner,
        address _denominationAsset,
        uint256 _sharesActionTimelock
    ) internal returns (IComptroller comptrollerProxy_, IVault vaultProxy_) {
        return createVault(_fundDeployer, _vaultOwner, _denominationAsset, _sharesActionTimelock, "", "");
    }

    function createVault(IFundDeployer _fundDeployer, address _vaultOwner, address _denominationAsset)
        internal
        returns (IComptroller comptrollerProxy_, IVault vaultProxy_)
    {
        return createVault(_fundDeployer, _vaultOwner, _denominationAsset, 0, "", "");
    }

    function createVault(
        IFundDeployer _fundDeployer,
        address _vaultOwner,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData
    ) internal returns (IComptroller comptrollerProxy_, IVault vaultProxy_) {
        (address comptrollerProxy, address vaultProxy) = _fundDeployer.createNewFund(
            _vaultOwner,
            "testVault",
            "TEST_VAULT",
            _denominationAsset,
            _sharesActionTimelock,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        comptrollerProxy_ = IComptroller(comptrollerProxy);
        vaultProxy_ = IVault(vaultProxy);
    }

    function createVaultAndBuyShares(
        IFundDeployer _fundDeployer,
        address _vaultOwner,
        address _sharesBuyer,
        address _denominationAsset,
        uint256 _amountToDeposit,
        uint256 _sharesActionTimelock,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData
    ) internal returns (IComptroller comptrollerProxy_, IVault vaultProxy_) {
        (comptrollerProxy_, vaultProxy_) = createVault({
            _fundDeployer: _fundDeployer,
            _vaultOwner: _vaultOwner,
            _denominationAsset: _denominationAsset,
            _sharesActionTimelock: _sharesActionTimelock,
            _feeManagerConfigData: _feeManagerConfigData,
            _policyManagerConfigData: _policyManagerConfigData
        });

        buyShares({_sharesBuyer: _sharesBuyer, _comptrollerProxy: comptrollerProxy_, _amountToDeposit: _amountToDeposit});
    }

    function createVaultAndBuyShares(
        IFundDeployer _fundDeployer,
        address _vaultOwner,
        address _sharesBuyer,
        address _denominationAsset,
        uint256 _amountToDeposit
    ) internal returns (IComptroller comptrollerProxy_, IVault vaultProxy_) {
        return createVaultAndBuyShares({
            _fundDeployer: _fundDeployer,
            _vaultOwner: _vaultOwner,
            _sharesBuyer: _sharesBuyer,
            _amountToDeposit: _amountToDeposit,
            _denominationAsset: _denominationAsset,
            _sharesActionTimelock: 0,
            _feeManagerConfigData: "",
            _policyManagerConfigData: ""
        });
    }

    function createVaultAndBuyShares(
        IFundDeployer _fundDeployer,
        address _vaultOwner,
        address _sharesBuyer,
        address _denominationAsset,
        uint256 _amountToDeposit,
        bytes memory _policyManagerConfigData
    ) internal returns (IComptroller comptrollerProxy_, IVault vaultProxy_) {
        return createVaultAndBuyShares({
            _fundDeployer: _fundDeployer,
            _vaultOwner: _vaultOwner,
            _sharesBuyer: _sharesBuyer,
            _amountToDeposit: _amountToDeposit,
            _denominationAsset: _denominationAsset,
            _sharesActionTimelock: 0,
            _feeManagerConfigData: "",
            _policyManagerConfigData: _policyManagerConfigData
        });
    }

    function createVaultFromMockFundDeployer(IDispatcher _dispatcher, address _vaultLibAddress)
        public
        returns (address vaultProxyAddress_)
    {
        address mockFundDeployerAddress = makeAddr("createVaultFromMockFundDeployer: MockFundDeployer");
        address vaultOwner = makeAddr("createVaultFromMockFundDeployer: VaultOwner");

        address originalFundDeployerAddress = _dispatcher.getCurrentFundDeployer();

        // 1. Create MockFundDeployer with empty IMigrationHookHandler function calls
        vm.mockCall({
            callee: mockFundDeployerAddress,
            data: abi.encodeWithSelector(IMigrationHookHandler.invokeMigrationOutHook.selector),
            returnData: ""
        });
        vm.mockCall({
            callee: mockFundDeployerAddress,
            data: abi.encodeWithSelector(IMigrationHookHandler.invokeMigrationInCancelHook.selector),
            returnData: ""
        });

        // 2. Set MockFundDeployer as the current Dispatcher.FundDeployer
        vm.prank(_dispatcher.getOwner());
        _dispatcher.setCurrentFundDeployer(mockFundDeployerAddress);

        // 3. Deploy new vaultProxy via the MockFundDeployer.
        // Contract-ify a vault accessor by setting arbitrary bytecode, to pass isContract() requirement.
        address prevVaultAccessorAddress = makeAddr("createVaultFromMockFundDeployer: VaultAccessor");
        vm.etch({target: prevVaultAccessorAddress, newRuntimeBytecode: "0x1"});

        vm.prank(mockFundDeployerAddress);
        vaultProxyAddress_ = _dispatcher.deployVaultProxy({
            _vaultLib: _vaultLibAddress,
            _owner: vaultOwner,
            _vaultAccessor: prevVaultAccessorAddress,
            _fundName: "Test Vault Via Mock FundDeployer"
        });

        // 4. Re-set the original FundDeployer, if applicable
        if (originalFundDeployerAddress != address(0)) {
            vm.prank(_dispatcher.getOwner());
            _dispatcher.setCurrentFundDeployer(originalFundDeployerAddress);
        }

        return vaultProxyAddress_;
    }

    function buyShares(address _sharesBuyer, IComptroller _comptrollerProxy, uint256 _amountToDeposit)
        internal
        returns (uint256 sharesReceived_)
    {
        IERC20 denominationAsset = IERC20(_comptrollerProxy.getDenominationAsset());
        deal(address(denominationAsset), _sharesBuyer, _amountToDeposit);

        vm.startPrank(_sharesBuyer);
        denominationAsset.approve(address(_comptrollerProxy), _amountToDeposit);
        sharesReceived_ = _comptrollerProxy.buyShares({_investmentAmount: _amountToDeposit, _minSharesQuantity: 1});
        vm.stopPrank();
    }

    function buySharesOnBehalf(
        address _sharesBuyer,
        address _sharesRecipient,
        IComptroller _comptrollerProxy,
        uint256 _amountToDeposit
    ) internal returns (uint256 sharesReceived_) {
        IERC20 denominationAsset = IERC20(_comptrollerProxy.getDenominationAsset());
        deal(address(denominationAsset), _sharesBuyer, _amountToDeposit);

        vm.startPrank(_sharesRecipient);
        denominationAsset.approve(address(_comptrollerProxy), _amountToDeposit);
        sharesReceived_ = _comptrollerProxy.buySharesOnBehalf({
            _buyer: _sharesRecipient,
            _investmentAmount: _amountToDeposit,
            _minSharesQuantity: 1
        });
        vm.stopPrank();
    }

    function redeemSharesInKind(address _redeemer, IComptroller _comptrollerProxy, uint256 _sharesQuantity)
        internal
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        address[] memory noAssets = new address[](0);

        vm.prank(_redeemer);
        return _comptrollerProxy.redeemSharesInKind(_redeemer, _sharesQuantity, noAssets, noAssets);
    }

    function registerVaultCalls(
        IFundDeployer _fundDeployer,
        address[] memory _contracts,
        bytes4[] memory _selectors,
        bytes32[] memory _dataHashes
    ) internal {
        vm.prank(_fundDeployer.getOwner());

        _fundDeployer.registerVaultCalls(_contracts, _selectors, _dataHashes);
    }
}
