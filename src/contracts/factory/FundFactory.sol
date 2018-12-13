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

// TODO: inherit from Factory
/// @notice Creates fund components and links them together
contract FundFactory is AmguConsumer {

    event NewFund(
        address manager,
        address hub,
        address[12] components
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

    struct Components {
        address accounting;
        address feeManager;
        address participation;
        address policyManager;
        address shares;
        address trading;
        address vault;
        address priceSource;
        address registry;
        address version;
        address engine;
        address mlnToken;
    }

    address[] public funds;
    mapping (address => bool) public hubExists;
    mapping (address => address) public managersToHubs;
    mapping (address => Components) public managersToComponents;
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
        require(stepFor[msg.sender] == n - 1, "Previous step incomplete");
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
        managersToComponents[msg.sender].priceSource = managersToSettings[msg.sender].priceSource;
        managersToComponents[msg.sender].registry = registry;
        managersToComponents[msg.sender].version = address(version);
        managersToComponents[msg.sender].engine = engine;
        managersToComponents[msg.sender].mlnToken = mlnToken;
    }

    function createAccounting() step(2) amguPayable payable {
        managersToComponents[msg.sender].accounting = accountingFactory.createInstance(managersToHubs[msg.sender], managersToSettings[msg.sender].nativeAsset, managersToSettings[msg.sender].quoteAsset, managersToSettings[msg.sender].defaultAssets);
    }

    function createFeeManager() step(3) amguPayable payable {
        managersToComponents[msg.sender].feeManager = feeManagerFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].fees,
            managersToSettings[msg.sender].feeRates,
            managersToSettings[msg.sender].feePeriods
        );
    }

    function createParticipation() step(4) amguPayable payable {
        managersToComponents[msg.sender].participation = participationFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].defaultAssets,
            managersToComponents[msg.sender].registry
        );
    }

    function createPolicyManager() step(5) amguPayable payable {
        managersToComponents[msg.sender].policyManager = policyManagerFactory.createInstance(managersToHubs[msg.sender]);
    }

    function createShares() step(6) amguPayable payable {
        managersToComponents[msg.sender].shares = sharesFactory.createInstance(managersToHubs[msg.sender]);
    }

    function createTrading() step(7) amguPayable payable {
           managersToComponents[msg.sender].trading = tradingFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].exchanges,
            managersToSettings[msg.sender].adapters,
            managersToSettings[msg.sender].takesCustody,
            managersToComponents[msg.sender].registry
        );
    }

    function createVault() step(8) amguPayable payable {
        managersToComponents[msg.sender].vault = vaultFactory.createInstance(managersToHubs[msg.sender]);
    }

    function completeSetup() step(9) amguPayable payable {
        Components components = managersToComponents[msg.sender];
        Hub hub = Hub(managersToHubs[msg.sender]);
        hubExists[address(hub)] = true;
        hub.setSpokes([
            components.accounting,
            components.feeManager,
            components.participation,
            components.policyManager,
            components.shares,
            components.trading,
            components.vault,
            components.priceSource,
            components.registry,
            components.version,
            components.engine,
            components.mlnToken
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
                components.accounting,
                components.feeManager,
                components.participation,
                components.policyManager,
                components.shares,
                components.trading,
                components.vault,
                components.priceSource,
                components.registry,
                components.version,
                components.engine,
                components.mlnToken
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

