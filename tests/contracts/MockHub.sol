pragma solidity 0.6.4;

import "main/dependencies/DSGuard.sol";
import "main/fund/hub/Spoke.sol";
import "main/registry/IRegistry.sol";

/// @notice Hub used for testing
contract MockHub is DSGuard {

    struct Routes {
        address accounting;
        address feeManager;
        address policyManager;
        address shares;
        address vault;
        address registry;
        address fundFactory;
    }
    Routes public routes;
    address public manager;
    string public name;
    bool public isShutDown;

    function setManager(address _manager) public { manager = _manager; }

    function setName(string memory _name) public { name = _name; }

    function shutDownFund() public { isShutDown = true; }

    function setShutDownState(bool _state) public { isShutDown = _state; }

    function setSpokes(address[7] memory _spokes) public {
        routes.accounting = _spokes[0];
        routes.feeManager = _spokes[1];
        routes.policyManager = _spokes[2];
        routes.shares = _spokes[3];
        routes.vault = _spokes[4];
        routes.registry = _spokes[5];
        routes.fundFactory = _spokes[6];
    }

    function setRouting() public {
        address[7] memory spokes = [
            routes.accounting,
            routes.feeManager,
            routes.policyManager,
            routes.shares,
            routes.vault,
            routes.registry,
            routes.fundFactory
        ];
        Spoke(routes.accounting).initialize(spokes);
        Spoke(routes.feeManager).initialize(spokes);
        Spoke(routes.policyManager).initialize(spokes);
        Spoke(routes.shares).initialize(spokes);
        Spoke(routes.vault).initialize(spokes);
    }

    function setPermissions() public {
        permit(routes.shares, routes.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(routes.feeManager, routes.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(routes.shares, routes.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(routes.shares, routes.accounting, bytes4(keccak256('decreaseAssetBalance(address,uint256)')));
        permit(routes.shares, routes.accounting, bytes4(keccak256('increaseAssetBalance(address,uint256)')));
        permit(routes.shares, routes.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(routes.vault, routes.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(routes.vault, routes.accounting, bytes4(keccak256('decreaseAssetBalance(address,uint256)')));
        permit(routes.vault, routes.accounting, bytes4(keccak256('increaseAssetBalance(address,uint256)')));
        permit(routes.vault, routes.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(routes.accounting, routes.feeManager, bytes4(keccak256('rewardAllFees()')));
        permit(manager, routes.feeManager, bytes4(keccak256('register(address)')));
        permit(manager, routes.feeManager, bytes4(keccak256('batchRegister(address[])')));
        permit(manager, routes.policyManager, bytes4(keccak256('register(bytes4,address)')));
        permit(manager, routes.policyManager, bytes4(keccak256('batchRegister(bytes4[],address[])')));
        permit(manager, routes.shares, bytes4(keccak256('enableSharesInvestmentAssets(address[])')));
        permit(manager, routes.shares, bytes4(keccak256('disableSharesInvestmentAssets(address[])')));
        permit(bytes32(bytes20(msg.sender)), ANY, ANY);
    }

    function permitSomething(address _from, address _to, bytes4 _sig) public {
        permit(
            bytes32(bytes20(_from)),
            bytes32(bytes20(_to)),
            _sig
        );
    }

    function initializeSpoke(address _spoke) public {
        address[7] memory spokes = [
            routes.accounting,
            routes.feeManager,
            routes.policyManager,
            routes.shares,
            routes.vault,
            routes.registry,
            routes.fundFactory
        ];
        Spoke(_spoke).initialize(spokes);
    }

    function getName() public view returns (string memory) { return name; }
    function accounting() public view returns (address) { return routes.accounting; }
    function priceSource() public view returns (address) { return IRegistry(routes.registry).priceSource(); }
    function vault() public view returns (address) { return routes.vault; }
    function shares() public view returns (address) { return routes.shares; }
    function policyManager() public view returns (address) { return routes.policyManager; }
    function registry() public view returns (address) { return routes.registry; }
}
