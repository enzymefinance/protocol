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

    // Only used internally
    mapping (address => Settings) public managersToSettings;
    mapping (address => uint8) public stepFor;

    struct Settings {
        string name;
        address[] exchanges;
        address[] adapters;
        address quoteAsset;
        address nativeAsset;
        address[] defaultAssets;
        bool[] takesCustody;
        address priceSource;
        address[] fees;
        uint[] feeRates;
        uint[] feePeriods;
    }

    modifier step(uint8 n) {
        require(stepFor[msg.sender] == n - 1, "Invalid step");
        _;
        stepFor[msg.sender] = n;
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
        // address _compliance,
        // address[] _policies,
        address[] _fees,
        uint[] _feeRates,
        uint[] _feePeriods,
        address[] _exchanges,
        address[] _adapters,
        address _quoteAsset,
        address _nativeAsset,
        address[] _defaultAssets,
        bool[] _takesCustody,
        address _priceSource
    ) step(1) {
        require(!version.getShutDownStatus(), "Version cannot be shut down");
        managersToHubs[msg.sender] = new Hub(msg.sender, _name);
        managersToSettings[msg.sender] = Settings(
            _name,
            _exchanges,
            _adapters,
            _quoteAsset,
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

    function createAccounting() step(2) amguPayable payable {
        managersToRoutes[msg.sender].accounting = accountingFactory.createInstance(managersToHubs[msg.sender], managersToSettings[msg.sender].nativeAsset, managersToSettings[msg.sender].quoteAsset, managersToSettings[msg.sender].defaultAssets);
    }

    function createFeeManager() step(3) amguPayable payable {
        managersToRoutes[msg.sender].feeManager = feeManagerFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].fees,
            managersToSettings[msg.sender].feeRates,
            managersToSettings[msg.sender].feePeriods
        );
    }

    function createParticipation() step(4) amguPayable payable {
        managersToRoutes[msg.sender].participation = participationFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].defaultAssets,
            managersToRoutes[msg.sender].registry
        );
    }

    function createPolicyManager() step(5) amguPayable payable {
        managersToRoutes[msg.sender].policyManager = policyManagerFactory.createInstance(managersToHubs[msg.sender]);
    }

    function createShares() step(6) amguPayable payable {
        managersToRoutes[msg.sender].shares = sharesFactory.createInstance(managersToHubs[msg.sender]);
    }

    function createTrading() step(7) amguPayable payable {
           managersToRoutes[msg.sender].trading = tradingFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].exchanges,
            managersToSettings[msg.sender].adapters,
            managersToSettings[msg.sender].takesCustody,
            managersToRoutes[msg.sender].registry
        );
    }

    function createVault() step(8) amguPayable payable {
        managersToRoutes[msg.sender].vault = vaultFactory.createInstance(managersToHubs[msg.sender]);
    }

    function completeSetup() step(9) amguPayable payable {
        Hub.Routes routes = managersToRoutes[msg.sender];
        Hub hub = Hub(managersToHubs[msg.sender]);
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

        delete managersToSettings[msg.sender];

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

