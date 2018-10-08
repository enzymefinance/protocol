pragma solidity ^0.4.21;


import "../fund/accounting/Accounting.sol";
import "../fund/fees/FeeManager.sol";
import "../fund/hub/Hub.sol";
import "../fund/policies/Manager.sol";
import "../fund/participation/Participation.sol";
import "../fund/shares/Shares.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";

// TODO: integrate with existing infrastructure (version, governance, etc.)
// TODO: inherit from Factory
/// @notice Creates fund components and links them together
contract FundFactory {

    address public defaultPriceSource;
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
        address registrar;
        address version;
    }

    address[] public funds;
    mapping (address => address) public managersToHubs;
    mapping (address => Components) public managersToComponents;
    mapping (address => Settings) public managersToSettings;
    mapping (address => uint8) public stepFor;

    struct Settings {
        address[] exchanges;
        address[] adapters;
        address[] defaultAssets;
        bool[] takesCustody;
        address priceSource;
    }

    modifier step(uint8 n) {
        require(stepFor[msg.sender] == n - 1);
        _;
        stepFor[msg.sender] = n;
    }

    constructor(
        AccountingFactory _accountingFactory,
        FeeManagerFactory _feeManagerFactory,
        ParticipationFactory _participationFactory,
        SharesFactory _sharesFactory,
        TradingFactory _tradingFactory,
        VaultFactory _vaultFactory,
        PolicyManagerFactory _policyManagerFactory
    ) {
        accountingFactory = _accountingFactory;
        feeManagerFactory = _feeManagerFactory;
        participationFactory = _participationFactory;
        sharesFactory = _sharesFactory;
        tradingFactory = _tradingFactory;
        vaultFactory = _vaultFactory;
        policyManagerFactory = _policyManagerFactory;
    }

    // TODO: improve naming
    function createComponents(
        // string _name,
        // address _quoteAsset,
        // address _compliance,
        // address[] _policies,
        // address[] _fees,
        address[] _exchanges,
        address[] _adapters,
        address[] _defaultAssets,
        bool[] _takesCustody,
        address _priceSource
    ) public step(1) {
        managersToHubs[msg.sender] = new Hub(msg.sender);
        managersToSettings[msg.sender] = Settings(
            _exchanges,
            _adapters,
            _defaultAssets,
            _takesCustody,
            _priceSource
        );
        managersToComponents[msg.sender].accounting = accountingFactory.createInstance(managersToHubs[msg.sender], managersToSettings[msg.sender].defaultAssets);
        managersToComponents[msg.sender].feeManager = feeManagerFactory.createInstance(managersToHubs[msg.sender]);
        managersToComponents[msg.sender].participation = participationFactory.createInstance(managersToHubs[msg.sender]);
        managersToComponents[msg.sender].policyManager = policyManagerFactory.createInstance(managersToHubs[msg.sender]);
    }

    // TODO: improve naming
    function continueCreation() public step(2) {
        Hub hub = Hub(managersToHubs[msg.sender]);
        managersToComponents[msg.sender].shares = sharesFactory.createInstance(managersToHubs[msg.sender]);
        managersToComponents[msg.sender].trading = tradingFactory.createInstance(managersToHubs[msg.sender], managersToSettings[msg.sender].exchanges, managersToSettings[msg.sender].adapters, managersToSettings[msg.sender].takesCustody);
        managersToComponents[msg.sender].vault = vaultFactory.createInstance(managersToHubs[msg.sender]); 
        managersToComponents[msg.sender].priceSource = managersToSettings[msg.sender].priceSource;
        managersToComponents[msg.sender].registrar = managersToSettings[msg.sender].priceSource;
    }

    // TODO: improve naming
    function setupFund() public step(3) {
        Components components = managersToComponents[msg.sender];
        Hub hub = Hub(managersToHubs[msg.sender]);
        hub.setSpokes([
            components.accounting,
            components.feeManager,
            components.participation,
            components.policyManager,
            components.shares,
            components.trading,
            components.vault,
            components.priceSource,
            components.registrar,
            components.version
        ]);
        hub.setRouting();
        hub.setPermissions();
        funds.push(hub);
    }

    function getFundById(uint withId) public view returns (address) { return funds[withId]; }
    function getLastFundId() public view returns (uint) { return funds.length - 1; }
}

