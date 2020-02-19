pragma solidity 0.6.1;

import "../../dependencies/DSGuard.sol";
import "./Spoke.sol";
import "../../version/Registry.sol";

/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub is DSGuard {

    event FundShutDown();

    struct Routes {
        address accounting;
        address feeManager;
        address participation;
        address policyManager;
        address shares;
        address trading;
        address vault;
        address registry;
        address version;
        address engine;
        address mlnToken;
    }

    Routes public routes;
    address public manager;
    address public creator;
    string public name;
    bool public isShutDown;
    bool public fundInitialized;
    uint public creationTime;
    mapping (address => bool) public isSpoke;

    constructor(address _manager, string memory _name) public {
        creator = msg.sender;
        manager = _manager;
        name = _name;
        creationTime = block.timestamp;
    }

    modifier onlyCreator() {
        require(msg.sender == creator, "Only creator can do this");
        _;
    }

    function shutDownFund() external {
        require(msg.sender == routes.version);
        isShutDown = true;
        emit FundShutDown();
    }

    function initializeAndSetPermissions(address[11] calldata _spokes) external onlyCreator {
        require(!fundInitialized, "Fund is already initialized");
        for (uint i = 0; i < _spokes.length; i++) {
            isSpoke[_spokes[i]] = true;
        }
        routes.accounting = _spokes[0];
        routes.feeManager = _spokes[1];
        routes.participation = _spokes[2];
        routes.policyManager = _spokes[3];
        routes.shares = _spokes[4];
        routes.trading = _spokes[5];
        routes.vault = _spokes[6];
        routes.registry = _spokes[7];
        routes.version = _spokes[8];
        routes.engine = _spokes[9];
        routes.mlnToken = _spokes[10];

        Spoke(routes.accounting).initialize(_spokes);
        Spoke(routes.feeManager).initialize(_spokes);
        Spoke(routes.participation).initialize(_spokes);
        Spoke(routes.policyManager).initialize(_spokes);
        Spoke(routes.shares).initialize(_spokes);
        Spoke(routes.trading).initialize(_spokes);
        Spoke(routes.vault).initialize(_spokes);

        permit(routes.participation, routes.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(routes.trading, routes.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(routes.participation, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(routes.participation, routes.shares, bytes4(keccak256('destroyFor(address,uint256)')));
        permit(routes.feeManager, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(routes.participation, routes.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(routes.trading, routes.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(routes.trading, routes.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(routes.accounting, routes.feeManager, bytes4(keccak256('rewardAllFees()')));
        permit(manager, routes.policyManager, bytes4(keccak256('register(bytes4,address)')));
        permit(manager, routes.policyManager, bytes4(keccak256('batchRegister(bytes4[],address[])')));
        permit(manager, routes.participation, bytes4(keccak256('enableInvestment(address[])')));
        permit(manager, routes.participation, bytes4(keccak256('disableInvestment(address[])')));
        permit(manager, routes.trading, bytes4(keccak256('addExchange(address,address)')));
        fundInitialized = true;
    }

    function vault() external view returns (address) { return routes.vault; }
    function accounting() external view returns (address) { return routes.accounting; }
    function priceSource() external view returns (address) { return Registry(routes.registry).priceSource(); }
    function participation() external view returns (address) { return routes.participation; }
    function trading() external view returns (address) { return routes.trading; }
    function shares() external view returns (address) { return routes.shares; }
    function registry() external view returns (address) { return routes.registry; }
    function version() external view returns (address) { return routes.version; }
    function policyManager() external view returns (address) { return routes.policyManager; }
}

