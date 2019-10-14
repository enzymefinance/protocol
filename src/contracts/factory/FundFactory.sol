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
    mapping (address => address) public creatorsToManagers;
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

    modifier componentNotSet(address _component) {
        require(
            !componentExists(_component),
            "This step has already been run"
        );
        _;
    }

    modifier componentSet(address _component) {
        require(
            componentExists(_component),
            "Component preprequisites not met"
        );
        _;
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
        componentNotSet(managersToHubs[_manager])
    {
        require(
            creatorsToManagers[msg.sender] == address(0),
            "This address has already created a Fund"
        );
        creatorsToManagers[msg.sender] = _manager;

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

    function createAccounting()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].accounting)
        amguPayable(false)
        payable
    {
        managersToRoutes[creatorsToManagers[msg.sender]].accounting = accountingFactory.createInstance(
            managersToHubs[creatorsToManagers[msg.sender]],
            managersToSettings[creatorsToManagers[msg.sender]].denominationAsset,
            Registry(registry).nativeAsset(),
            managersToSettings[creatorsToManagers[msg.sender]].defaultAssets
        );
    }

    function createFeeManager()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].feeManager)
        amguPayable(false)
        payable
    {
        managersToRoutes[creatorsToManagers[msg.sender]].feeManager = feeManagerFactory.createInstance(
            managersToHubs[creatorsToManagers[msg.sender]],
            managersToSettings[creatorsToManagers[msg.sender]].denominationAsset,
            managersToSettings[creatorsToManagers[msg.sender]].fees,
            managersToSettings[creatorsToManagers[msg.sender]].feeRates,
            managersToSettings[creatorsToManagers[msg.sender]].feePeriods,
            registry
        );
    }

    function createParticipation()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].participation)
        amguPayable(false)
        payable
    {
        managersToRoutes[creatorsToManagers[msg.sender]].participation = participationFactory.createInstance(
            managersToHubs[creatorsToManagers[msg.sender]],
            managersToSettings[creatorsToManagers[msg.sender]].defaultAssets,
            managersToRoutes[creatorsToManagers[msg.sender]].registry
        );
    }

    function createPolicyManager()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].policyManager)
        amguPayable(false)
        payable
    {
        address manager = creatorsToManagers[msg.sender];
        managersToRoutes[manager].policyManager = policyManagerFactory.createInstance(
            managersToHubs[manager]
        );
    }

    function createShares()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].shares)
        amguPayable(false)
        payable
    {
        address manager = creatorsToManagers[msg.sender];
        managersToRoutes[manager].shares = sharesFactory.createInstance(
            managersToHubs[manager]
        );
    }

    function createTrading()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].trading)
        amguPayable(false)
        payable
    {
        managersToRoutes[creatorsToManagers[msg.sender]].trading = tradingFactory.createInstance(
            managersToHubs[creatorsToManagers[msg.sender]],
            managersToSettings[creatorsToManagers[msg.sender]].exchanges,
            managersToSettings[creatorsToManagers[msg.sender]].adapters,
            managersToRoutes[creatorsToManagers[msg.sender]].registry
        );
    }

    function createVault()
        external
        componentSet(managersToHubs[creatorsToManagers[msg.sender]])
        componentNotSet(managersToRoutes[creatorsToManagers[msg.sender]].vault)
        amguPayable(false)
        payable
    {
        address manager = creatorsToManagers[msg.sender];
        managersToRoutes[manager].vault = vaultFactory.createInstance(
            managersToHubs[manager]
        );
    }

    function completeSetup() external amguPayable(false) payable {
        address manager = creatorsToManagers[msg.sender];
        Hub.Routes routes = managersToRoutes[manager];
        Hub hub = Hub(managersToHubs[manager]);
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
            manager,
            managersToSettings[manager].name
        );

        emit NewFund(
            manager,
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


