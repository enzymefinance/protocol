pragma solidity 0.5.15;
pragma experimental ABIEncoderV2;

import "../fund/accounting/IAccounting.sol";
import "../fund/fees/IFeeManager.sol";
import "../fund/hub/Hub.sol";
import "../fund/policies/IPolicyManager.sol";
import "../fund/participation/IParticipation.sol";
import "../fund/shares/IShares.sol";
import "../fund/trading/ITrading.sol";
import "../fund/vault/IVault.sol";
import "../version/IVersion.sol";
import "../engine/AmguConsumer.sol";
import "./Factory.sol";

/// @notice Creates fund routes and links them together
contract FundFactory is AmguConsumer, Factory {

    event NewFund(
        address indexed manager,
        address indexed hub,
        address[12] routes
    );

    IVersion public version;
    Registry public associatedRegistry;
    IAccountingFactory public accountingFactory;
    IFeeManagerFactory public feeManagerFactory;
    IParticipationFactory public participationFactory;
    IPolicyManagerFactory public policyManagerFactory;
    ISharesFactory public sharesFactory;
    ITradingFactory public tradingFactory;
    IVaultFactory public vaultFactory;

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
    )
        public
    {
        accountingFactory = IAccountingFactory(_accountingFactory);
        feeManagerFactory = IFeeManagerFactory(_feeManagerFactory);
        participationFactory = IParticipationFactory(_participationFactory);
        sharesFactory = ISharesFactory(_sharesFactory);
        tradingFactory = ITradingFactory(_tradingFactory);
        vaultFactory = IVaultFactory(_vaultFactory);
        policyManagerFactory = IPolicyManagerFactory(_policyManagerFactory);
        version = IVersion(_version);
    }

    function componentExists(address _component) internal pure returns (bool) {
        return _component != address(0);
    }

    function beginSetup(
        string memory _name,
        address[] memory _fees,
        uint[] memory _feeRates,
        uint[] memory _feePeriods,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _denominationAsset,
        address[] memory _defaultAssets
    )
        public
        componentNotSet(managersToHubs[msg.sender])
    {
        associatedRegistry.reserveFundName(
            msg.sender,
            _name
        );
        require(
            associatedRegistry.assetIsRegistered(_denominationAsset),
            "Denomination asset must be registered"
        );

        managersToHubs[msg.sender] = address(new Hub(msg.sender, _name));
        managersToSettings[msg.sender] = Settings(
            _name,
            _exchanges,
            _adapters,
            _denominationAsset,
            _defaultAssets,
            _fees,
            _feeRates,
            _feePeriods
        );
        managersToRoutes[msg.sender].priceSource = priceSource();
        managersToRoutes[msg.sender].registry = address(associatedRegistry);
        managersToRoutes[msg.sender].version = address(version);
        managersToRoutes[msg.sender].engine = engine();
        managersToRoutes[msg.sender].mlnToken = mlnToken();
    }

    function createAccounting()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].accounting)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].accounting = accountingFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].denominationAsset,
            associatedRegistry.nativeAsset(),
            managersToSettings[msg.sender].defaultAssets
        );
    }

    function createFeeManager()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].feeManager)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].feeManager = feeManagerFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].denominationAsset,
            managersToSettings[msg.sender].fees,
            managersToSettings[msg.sender].feeRates,
            managersToSettings[msg.sender].feePeriods,
            managersToRoutes[msg.sender].registry
        );
    }

    function createParticipation()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].participation)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].participation = participationFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].defaultAssets,
            managersToRoutes[msg.sender].registry
        );
    }

    function createPolicyManager()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].policyManager)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].policyManager = policyManagerFactory.createInstance(
            managersToHubs[msg.sender]
        );
    }

    function createShares()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].shares)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].shares = sharesFactory.createInstance(
            managersToHubs[msg.sender]
        );
    }

    function createTrading()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].trading)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].trading = tradingFactory.createInstance(
            managersToHubs[msg.sender],
            managersToSettings[msg.sender].exchanges,
            managersToSettings[msg.sender].adapters,
            managersToRoutes[msg.sender].registry
        );
    }

    function createVault()
        external
        componentSet(managersToHubs[msg.sender])
        componentNotSet(managersToRoutes[msg.sender].vault)
        amguPayable(false)
        payable
    {
        managersToRoutes[msg.sender].vault = vaultFactory.createInstance(
            managersToHubs[msg.sender]
        );
    }

    function completeSetup() external amguPayable(false) payable {
        Hub.Routes memory routes = managersToRoutes[msg.sender];
        Hub hub = Hub(managersToHubs[msg.sender]);
        require(!childExists[address(hub)], "Setup already complete");
        require(
            componentExists(address(hub)) &&
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
        funds.push(address(hub));
        associatedRegistry.registerFund(
            address(hub),
            msg.sender,
            managersToSettings[msg.sender].name
        );

        emit NewFund(
            msg.sender,
            address(hub),
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
        return address(associatedRegistry.mlnToken());
    }
    function engine() public view returns (address) {
        return address(associatedRegistry.engine());
    }
    function priceSource() public view returns (address) {
        return address(associatedRegistry.priceSource());
    }
    function registry() public view returns (address) { return address(associatedRegistry); }
    function getExchangesInfo(address user) public view returns (address[] memory) {
        return (managersToSettings[user].exchanges);
    }
}

