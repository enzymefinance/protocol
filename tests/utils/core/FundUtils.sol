// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExtension} from "tests/interfaces/internal/IExtension.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IMigrationHookHandler} from "tests/interfaces/internal/IMigrationHookHandler.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {MockDefaultMigrationHookHandler} from "tests/utils/Mocks.sol";

bytes32 constant ANY_VAULT_CALL = keccak256(abi.encodePacked("mln.vaultCall.any"));

abstract contract FundUtils is CoreUtilsBase {
    function addTrackedAsset(IVaultLib _vaultProxy, IERC20 _asset, uint256 _seedAmount) internal {
        if (_seedAmount > 0) {
            increaseTokenBalance(IERC20(address(_vaultProxy)), address(_asset), _seedAmount);
        }

        vm.prank(_vaultProxy.getAccessor());
        _vaultProxy.addTrackedAsset(address(_asset));
    }

    function predictVaultProxyAddress(IDispatcher _dispatcher) internal view returns (address) {
        return computeCreateAddress(address(_dispatcher), vm.getNonce(address(_dispatcher)));
    }

    function predictComptrollerProxyAddress(IFundDeployer _fundDeployer) internal view returns (address) {
        return computeCreateAddress(address(_fundDeployer), vm.getNonce(address(_fundDeployer)));
    }

    function createFund(IFundDeployer _fundDeployer, IFundDeployer.ConfigInput memory _comptrollerConfig)
        internal
        returns (IComptrollerLib comptrollerProxy_, IVaultLib vaultProxy_, address fundOwner_)
    {
        fundOwner_ = makeAddr("createFund: FundOwner");

        (address comptrollerProxy, address vaultProxy) = _fundDeployer.createNewFund({
            _fundOwner: fundOwner_,
            _fundName: "testFund",
            _fundSymbol: "TEST_FUND",
            _comptrollerConfig: _comptrollerConfig
        });

        comptrollerProxy_ = IComptrollerLib(comptrollerProxy);
        vaultProxy_ = IVaultLib(payable(vaultProxy));
    }

    function createFundMinimal(IFundDeployer _fundDeployer, IERC20 _denominationAsset)
        internal
        returns (IComptrollerLib comptrollerProxy_, IVaultLib vaultProxy_, address fundOwner_)
    {
        IFundDeployer.ConfigInput memory config;
        config.denominationAsset = address(_denominationAsset);

        return createFund({_fundDeployer: _fundDeployer, _comptrollerConfig: config});
    }

    function createFundWithExtension(
        IFundDeployer _fundDeployer,
        IERC20 _denominationAsset,
        address _extensionAddress,
        bytes memory _extensionConfigData
    ) internal returns (IComptrollerLib comptrollerProxy_, IVaultLib vaultProxy_, address fundOwner_) {
        IFundDeployer.ConfigInput memory config;
        config.denominationAsset = address(_denominationAsset);
        config.extensionsConfig = new IFundDeployer.ExtensionConfigInput[](1);
        config.extensionsConfig[0].extension = _extensionAddress;
        config.extensionsConfig[0].configData = _extensionConfigData;

        return createFund({_fundDeployer: _fundDeployer, _comptrollerConfig: config});
    }

    function createFundWithPolicy(
        IFundDeployer _fundDeployer,
        IERC20 _denominationAsset,
        address _policyAddress,
        bytes memory _policySettings
    ) internal returns (IComptrollerLib comptrollerProxy_, IVaultLib vaultProxy_, address fundOwner_) {
        IFundDeployer.ConfigInput memory comptrollerConfig;
        comptrollerConfig.denominationAsset = address(_denominationAsset);
        comptrollerConfig.policyManagerConfigData = abi.encode(toArray(_policyAddress), toArray(_policySettings));

        (comptrollerProxy_, vaultProxy_, fundOwner_) =
            createFund({_fundDeployer: _fundDeployer, _comptrollerConfig: comptrollerConfig});
    }

    function createVaultFromMockFundDeployer(IDispatcher _dispatcher, address _vaultLibAddress)
        internal
        returns (address vaultProxyAddress_)
    {
        address vaultOwner = makeAddr("createVaultFromMockFundDeployer: VaultOwner");
        address originalFundDeployerAddress = _dispatcher.getCurrentFundDeployer();

        // 1. Create MockFundDeployer
        address mockFundDeployerAddress = address(new MockDefaultMigrationHookHandler());

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

    function buyShares(address _sharesBuyer, IComptrollerLib _comptrollerProxy, uint256 _amountToDeposit)
        internal
        returns (uint256 sharesReceived_)
    {
        IERC20 denominationAsset = IERC20(_comptrollerProxy.getDenominationAsset());
        increaseTokenBalance({_token: denominationAsset, _to: _sharesBuyer, _amount: _amountToDeposit});

        vm.startPrank(_sharesBuyer);
        denominationAsset.approve(address(_comptrollerProxy), _amountToDeposit);
        sharesReceived_ = _comptrollerProxy.buyShares({_investmentAmount: _amountToDeposit, _minSharesQuantity: 1});
        vm.stopPrank();
    }

    function buySharesOnBehalf(
        address _sharesBuyer,
        address _sharesRecipient,
        IComptrollerLib _comptrollerProxy,
        uint256 _amountToDeposit
    ) internal returns (uint256 sharesReceived_) {
        IERC20 denominationAsset = IERC20(_comptrollerProxy.getDenominationAsset());
        increaseTokenBalance({_token: denominationAsset, _to: _sharesBuyer, _amount: _amountToDeposit});

        vm.startPrank(_sharesRecipient);
        denominationAsset.approve(address(_comptrollerProxy), _amountToDeposit);
        sharesReceived_ = _comptrollerProxy.buySharesOnBehalf({
            _buyer: _sharesRecipient,
            _investmentAmount: _amountToDeposit,
            _minSharesQuantity: 1
        });
        vm.stopPrank();
    }

    function redeemSharesForAsset(
        address _redeemer,
        IComptrollerLib _comptrollerProxy,
        uint256 _sharesQuantity,
        IERC20 _asset
    ) internal returns (uint256[] memory payoutAmounts_) {
        vm.prank(_redeemer);
        return _comptrollerProxy.redeemSharesForSpecificAssets({
            _recipient: _redeemer,
            _sharesQuantity: _sharesQuantity,
            _payoutAssets: toArray(address(_asset)),
            _payoutAssetPercentages: toArray(BPS_ONE_HUNDRED_PERCENT)
        });
    }

    function redeemSharesInKind(address _redeemer, IComptrollerLib _comptrollerProxy, uint256 _sharesQuantity)
        internal
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        address[] memory noAssets = new address[](0);

        vm.prank(_redeemer);
        return _comptrollerProxy.redeemSharesInKind(_redeemer, _sharesQuantity, noAssets, noAssets);
    }

    function registerVaultCall(IFundDeployer _fundDeployer, address _contract, bytes4 _selector) internal {
        // bytes4 complains about toArray() usage
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = _selector;

        registerVaultCalls(_fundDeployer, toArray(_contract), selectors, toArray(ANY_VAULT_CALL));
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
