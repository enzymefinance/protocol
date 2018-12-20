pragma solidity ^0.4.21;
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
        address manager,
        address hub,
        address[12] routes
    );

    address public factoryPriceSource;
    address public mlnToken;
    VersionInterface public version;
    address public engine;
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
    mapping (address => Hub.Routes) public managersToRoutes;
    mapping (address => Settings) public managersToSettings;

    /// @dev Parameters stored when beginning setup
    struct Settings {
        string name;
        address[] exchanges;
        address[] adapters;
        address denominationAsset;
        address nativeAsset;
        address[] defaultAssets;
        bool[] takesCustody;
        address priceSource;
        address[] fees;
        uint[] feeRates;
        uint[] feePeriods;
    }

    modifier componentNotSet(address _component) {
        require(
            _component == address(0),
            "This step has already been run"
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
        address _version,
        address _engine,
        address _factoryPriceSource,
        address _mlnToken
    ) {
        accountingFactory = AccountingFactory(_accountingFactory);
        feeManagerFactory = FeeManagerFactory(_feeManagerFactory);
        participationFactory = ParticipationFactory(_participationFactory);
        sharesFactory = SharesFactory(_sharesFactory);
        tradingFactory = TradingFactory(_tradingFactory);
        vaultFactory = VaultFactory(_vaultFactory);
        policyManagerFactory = PolicyManagerFactory(_policyManagerFactory);
        version = VersionInterface(_version);
        engine = Engine(_engine);
        factoryPriceSource = _factoryPriceSource;
        mlnToken = _mlnToken;
    }

    function beginSetup(
        string _name,
        address[] _fees,
        uint[] _feeRates,
        uint[] _feePeriods,
        address[] _exchanges,
        address[] _adapters,
        address _denominationAsset,
        address _nativeAsset,
        address[] _defaultAssets,
        bool[] _takesCustody,
        address _priceSource
    ) componentNotSet(managersToHubs[msg.sender]) {
        require(!version.getShutDownStatus(), "Version cannot be shut down");
        managersToHubs[msg.sender] = new Hub(msg.sender, _name);
        managersToSettings[msg.sender] = Settings(
            _name,
            _exchanges,
            _adapters,
            _denominationAsset,
            _nativeAsset,
            _defaultAssets,
            _takesCustody,
            _priceSource,
            _fees,
            _feeRates,
            _feePeriods
        );
        managersToRoutes[msg.sender].priceSource = managersToSettings[msg.sender].priceSource;
        managersToRoutes[msg.sender].registry = registry;
        managersToRoutes[msg.sender].version = address(version);
        managersToRoutes[msg.sender].engine = engine;
        managersToRoutes[msg.sender].mlnToken = mlnToken;
    }

    function createAccounting()
        componentNotSet(managersToRoutes[msg.sender].accounting)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].accounting = accountingFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].denominationAsset,
            managersToSettings[msg.sender].nativeAsset,
            managersToSettings[msg.sender].defaultAssets
        );
    }

    function createFeeManager()
        componentNotSet(managersToRoutes[msg.sender].feeManager)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].feeManager = feeManagerFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].fees,
            managersToSettings[msg.sender].feeRates,
            managersToSettings[msg.sender].feePeriods
        );
    }

    function createParticipation()
        componentNotSet(managersToRoutes[msg.sender].participation)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].participation = participationFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].defaultAssets,
            managersToRoutes[msg.sender].registry
        );
    }

    function createPolicyManager()
        componentNotSet(managersToRoutes[msg.sender].policyManager)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].policyManager = policyManagerFactory.createInstance(
            managersToHubs[msg.sender]
        );
    }

    function createShares()
        componentNotSet(managersToRoutes[msg.sender].shares)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].shares = sharesFactory.createInstance(
            managersToHubs[msg.sender]
        );
    }

    function createTrading()
        componentNotSet(managersToRoutes[msg.sender].trading)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].trading = tradingFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].exchanges,
            managersToSettings[msg.sender].adapters,
            managersToSettings[msg.sender].takesCustody,
            managersToRoutes[msg.sender].registry
        );
    }

    function createVault()
        componentNotSet(managersToRoutes[msg.sender].vault)
        amguPayable
        payable
    {
        managersToRoutes[msg.sender].vault = vaultFactory.createInstance(
            managersToHubs[msg.sender]
        );
    }

    function completeSetup() amguPayable payable {
        Hub.Routes routes = managersToRoutes[msg.sender];
        Hub hub = Hub(managersToHubs[msg.sender]);
        require(!childExists[address(hub)], "Setup already complete");
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
        Registry(registry).registerFund(address(hub));

        emit NewFund(
            msg.sender,
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

    function getFundById(uint withId) public view returns (address) { return funds[withId]; }
    function getLastFundId() public view returns (uint) { return funds.length - 1; }

    function engine() view returns (address) { return address(engine); }
    function mlnToken() view returns (address) { return address(mlnToken); }
    function priceSource() view returns (address) { return address(factoryPriceSource); }
    function version() view returns (address) { return address(version); }
}

