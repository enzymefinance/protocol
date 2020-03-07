pragma solidity 0.6.1;

import "../../dependencies/DSGuard.sol";
import "../../registry/IRegistry.sol";
import "./Spoke.sol";

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
        address vault;
        address registry;
        address fundFactory;
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
        require(msg.sender == routes.fundFactory);
        isShutDown = true;
        emit FundShutDown();
    }

    function initializeAndSetPermissions(address[8] calldata _spokes) external onlyCreator {
        require(!fundInitialized, "Fund is already initialized");
        for (uint i = 0; i < _spokes.length; i++) {
            isSpoke[_spokes[i]] = true;
        }
        routes.accounting = _spokes[0];
        routes.feeManager = _spokes[1];
        routes.participation = _spokes[2];
        routes.policyManager = _spokes[3];
        routes.shares = _spokes[4];
        routes.vault = _spokes[5];
        routes.registry = _spokes[6];
        routes.fundFactory = _spokes[7];

        Spoke(routes.accounting).initialize(_spokes);
        Spoke(routes.feeManager).initialize(_spokes);
        Spoke(routes.participation).initialize(_spokes);
        Spoke(routes.policyManager).initialize(_spokes);
        Spoke(routes.shares).initialize(_spokes);
        Spoke(routes.vault).initialize(_spokes);

        permit(manager, routes.participation, bytes4(keccak256('enableInvestment(address[])')));
        permit(manager, routes.participation, bytes4(keccak256('disableInvestment(address[])')));
        permit(
            manager,
            routes.policyManager,
            bytes4(keccak256('batchRegister(bytes4[],address[])'))
        );
        permit(manager, routes.policyManager, bytes4(keccak256('register(bytes4,address)')));
        permit(manager, routes.vault, bytes4(keccak256('addExchange(address,address)')));
        permit(routes.accounting, routes.feeManager, bytes4(keccak256('rewardAllFees()')));
        permit(routes.feeManager, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(
            routes.participation,
            routes.accounting,
            bytes4(keccak256('decreaseAssetBalance(address,uint256)'))
        );
        permit(
            routes.participation,
            routes.accounting,
            bytes4(keccak256('increaseAssetBalance(address,uint256)'))
        );
        permit(
            routes.participation,
            routes.shares,
            bytes4(keccak256('createFor(address,uint256)'))
        );
        permit(
            routes.participation,
            routes.shares,
            bytes4(keccak256('destroyFor(address,uint256)'))
        );
        permit(routes.participation, routes.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(
            routes.vault,
            routes.accounting,
            bytes4(keccak256('decreaseAssetBalance(address,uint256)'))
        );
        permit(
            routes.vault,
            routes.accounting,
            bytes4(keccak256('increaseAssetBalance(address,uint256)'))
        );
        fundInitialized = true;
    }

    function accounting() external view returns (address) { return routes.accounting; }
    function priceSource() external view returns (address) {
        return IRegistry(routes.registry).priceSource();
    }
    function participation() external view returns (address) { return routes.participation; }
    function vault() external view returns (address) { return routes.vault; }
    function shares() external view returns (address) { return routes.shares; }
    function registry() external view returns (address) { return routes.registry; }
    function fundFactory() external view returns (address) { return routes.fundFactory; }
    function policyManager() external view returns (address) { return routes.policyManager; }
}
