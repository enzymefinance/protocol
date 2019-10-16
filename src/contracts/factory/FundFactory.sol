pragma solidity ^0.4.25;
pragma experimental ABIEncoderV2;

import "Accounting.sol";
import "FeeManager.sol";
import "Hub.sol";
import "PolicyManager.sol";
import "Participation.sol";
import "Shares.sol";
import "Trading.sol";
import "Vault.sol";
import "Version.i.sol";
import "AmguConsumer.sol";
import "Factory.sol";

/// @notice Creates fund routes and links them together
contract FundFactory is AmguConsumer, Factory {

    event NewFund(
        address indexed manager,
        address indexed hub,
        address[12] routes
    );

    VersionInterface public version;
    address public registry;
    AccountingFactory public accountingFactory;
    FeeManagerFactory public feeManagerFactory;
    ParticipationFactory public participationFactory;
    PolicyManagerFactory public policyManagerFactory;
    SharesFactory public sharesFactory;
    TradingFactory public tradingFactory;
    VaultFactory public vaultFactory;

    address[] public funds;
    mapping (address => address) public managersToHubs;
    mapping (address => address) public managersToDelegatedCreators;
    mapping (address => Hub.Routes) public managersToRoutes;
    mapping (address => Settings) public managersToSettings;

    /// @dev Parameters stored when beginning setup
    struct Settings {
        string name;
        address[] exchanges;
        address[] adapters;
        address denominationAsset;
        address[] defaultAssets;
        address[] fees;
        uint[] feeRates;
        uint[] feePeriods;
    }

    constructor(
        address _accountingFactory,
        address _feeManagerFactory,
        address _participationFactory,
        address _sharesFactory,
        address _tradingFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _version
    ) {
        accountingFactory = AccountingFactory(_accountingFactory);
        feeManagerFactory = FeeManagerFactory(_feeManagerFactory);
        participationFactory = ParticipationFactory(_participationFactory);
        sharesFactory = SharesFactory(_sharesFactory);
        tradingFactory = TradingFactory(_tradingFactory);
        vaultFactory = VaultFactory(_vaultFactory);
        policyManagerFactory = PolicyManagerFactory(_policyManagerFactory);
        version = VersionInterface(_version);
    }

    function componentExists(address _component) internal returns (bool) {
        return _component != address(0);
    }

    function ensureComponentNotSet(address _component) internal {
        require(
            !componentExists(_component),
            "This step has already been run"
        );
    }

    function ensureComponentSet(address _component) internal {
        require(
            componentExists(_component),
            "Component preprequisites not met"
        );
    }

    // allow _creator to set up a fund for msg.sender
    // after this, the delegated creator OR the manager can initiate setup
    function permitDelegatedCreation(address _creator) external {
        managersToDelegatedCreators[msg.sender] = _creator;
    }

    function beginSetup(
        address _manager,
        string _name,
        address[] _fees,
        uint[] _feeRates,
        uint[] _feePeriods,
        address[] _exchanges,
        address[] _adapters,
        address _denominationAsset,
        address[] _defaultAssets
    )
        public
    {
        ensureComponentNotSet(managersToHubs[_manager]);
        require(
            managersToDelegatedCreators[_manager] == msg.sender ||
            msg.sender == _manager,
            "Not permitted to set up a Fund for this manager"
        );

        Registry(registry).reserveFundName(
            _manager,
            _name
        );
        require(
            Registry(registry).assetIsRegistered(_denominationAsset),
            "Denomination asset must be registered"
        );

        managersToHubs[_manager] = new Hub(_manager, _name);
        managersToSettings[_manager] = Settings(
            _name,
            _exchanges,
            _adapters,
            _denominationAsset,
            _defaultAssets,
            _fees,
            _feeRates,
            _feePeriods
        );
        managersToRoutes[_manager].priceSource = priceSource();
        managersToRoutes[_manager].registry = registry;
        managersToRoutes[_manager].version = address(version);
        managersToRoutes[_manager].engine = engine();
        managersToRoutes[_manager].mlnToken = mlnToken();
    }

    function _createAccountingFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].accounting);
        managersToRoutes[_manager].accounting = accountingFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].denominationAsset,
            Registry(registry).nativeAsset(),
            managersToSettings[_manager].defaultAssets
        );
    }

    function createAccountingFor(address _manager) external amguPayable(false) payable { _createAccountingFor(_manager); }
    function createAccounting() external amguPayable(false) payable { _createAccountingFor(msg.sender); }

    function _createFeeManagerFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].feeManager);
        managersToRoutes[_manager].feeManager = feeManagerFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].denominationAsset,
            managersToSettings[_manager].fees,
            managersToSettings[_manager].feeRates,
            managersToSettings[_manager].feePeriods,
            registry
        );
    }

    function createFeeManagerFor(address _manager) external amguPayable(false) payable { _createFeeManagerFor(_manager); }
    function createFeeManager() external amguPayable(false) payable { _createFeeManagerFor(msg.sender); }

    function _createParticipationFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].participation);
        managersToRoutes[_manager].participation = participationFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].defaultAssets,
            managersToRoutes[_manager].registry
        );
    }

    function createParticipationFor(address _manager) external amguPayable(false) payable { _createParticipationFor(_manager); }
    function createParticipation() external amguPayable(false) payable { _createParticipationFor(msg.sender); }

    function _createPolicyManagerFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].policyManager);
        managersToRoutes[_manager].policyManager = policyManagerFactory.createInstance(
            managersToHubs[_manager]
        );
    }

    function createPolicyManagerFor(address _manager) external amguPayable(false) payable { _createPolicyManagerFor(_manager); }
    function createPolicyManager() external amguPayable(false) payable { _createPolicyManagerFor(msg.sender); }

    function _createSharesFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].shares);
        managersToRoutes[_manager].shares = sharesFactory.createInstance(
            managersToHubs[_manager]
        );
    }

    function createSharesFor(address _manager) external amguPayable(false) payable { _createSharesFor(_manager); } 
    function createShares() external amguPayable(false) payable { _createSharesFor(msg.sender); } 

    function _createTradingFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].trading);
        managersToRoutes[_manager].trading = tradingFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].exchanges,
            managersToSettings[_manager].adapters,
            managersToRoutes[_manager].registry
        );
    }

    function createTradingFor(address _manager) external amguPayable(false) payable { _createTradingFor(_manager); } 
    function createTrading() external amguPayable(false) payable { _createTradingFor(msg.sender); } 

    function _createVaultFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].vault);
        managersToRoutes[_manager].vault = vaultFactory.createInstance(
            managersToHubs[_manager]
        );
    }

    function createVaultFor(address _manager) external amguPayable(false) payable { _createVaultFor(_manager); } 
    function createVault() external amguPayable(false) payable { _createVaultFor(msg.sender); } 

    function _completeSetupFor(address _manager)
        internal
    {
        Hub.Routes routes = managersToRoutes[_manager];
        Hub hub = Hub(managersToHubs[_manager]);
        require(!childExists[address(hub)], "Setup already complete");
        require(
            componentExists(hub) &&
            componentExists(routes.accounting) &&
            componentExists(routes.feeManager) &&
            componentExists(routes.participation) &&
            componentExists(routes.policyManager) &&
            componentExists(routes.shares) &&
            componentExists(routes.trading) &&
            componentExists(routes.vault),
            "Components must be set before completing setup"
        );
        childExists[address(hub)] = true;
        hub.setSpokes([
            routes.accounting,
            routes.feeManager,
            routes.participation,
            routes.policyManager,
            routes.shares,
            routes.trading,
            routes.vault,
            routes.priceSource,
            routes.registry,
            routes.version,
            routes.engine,
            routes.mlnToken
        ]);
        hub.setRouting();
        hub.setPermissions();
        funds.push(hub);
        Registry(registry).registerFund(
            address(hub),
            _manager,
            managersToSettings[_manager].name
        );

        emit NewFund(
            _manager,
            hub,
            [
                routes.accounting,
                routes.feeManager,
                routes.participation,
                routes.policyManager,
                routes.shares,
                routes.trading,
                routes.vault,
                routes.priceSource,
                routes.registry,
                routes.version,
                routes.engine,
                routes.mlnToken
            ]
        );
    }

    function completeSetupFor(address _manager) external amguPayable(false) payable { _completeSetupFor(_manager); } 
    function completeSetup() external amguPayable(false) payable { _completeSetupFor(msg.sender); } 


    function getFundById(uint withId) external view returns (address) { return funds[withId]; }
    function getLastFundId() external view returns (uint) { return funds.length - 1; }

    function mlnToken() public view returns (address) {
        return address(Registry(registry).mlnToken());
    }
    function engine() public view returns (address) {
        return address(Registry(registry).engine());
    }
    function priceSource() public view returns (address) {
        return address(Registry(registry).priceSource());
    }
    function version() public view returns (address) { return address(version); }
    function registry() public view returns (address) { return address(registry); }
    function getExchangesInfo(address user) public view returns (address[]) { 
        return (managersToSettings[user].exchanges); 
    }
}


