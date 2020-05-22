pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/libs/EnumerableSet.sol";
import "../../dependencies/TokenUser.sol";
import "../hub/Spoke.sol";
import "./IVault.sol";

/// @title Vault Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Stores fund assets and plugs into external services via integrations
contract Vault is IVault, TokenUser, Spoke {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AdaptersDisabled (address[] adapters);

    event AdaptersEnabled (address[] adapters);

    event AssetAdded(address asset);

    event AssetBalanceUpdated(address indexed asset, uint256 oldBalance, uint256 newBalance);

    event AssetRemoved(address asset);

    // This info is pulled from Registry
    // Better for fund to maintain its own copy in case the info changes on the Registry
    struct IntegrationInfo {
        address gateway;
        uint256 typeIndex;
    }

    uint8 constant public MAX_OWNED_ASSETS = 20; // TODO: Keep this?
    address[] public ownedAssets;
    mapping(address => uint256) public override assetBalances;

    EnumerableSet.AddressSet private enabledAdapters;
    mapping (address => IntegrationInfo) public adapterToIntegrationInfo;

    modifier onlyDelegated() {
        require(
            msg.sender == address(this),
            "Only a delegated contract can make this call"
        );
        _;
    }

    constructor(address _hub, address[] memory _adapters) public Spoke(_hub) {
        if (_adapters.length > 0) {
            __enableAdapters(_adapters);
        }
    }

    // EXTERNAL FUNCTIONS

    /// @notice Receive ether function (used to receive ETH in intermediary adapter steps)
    receive() external payable {}

    /// @notice Decrease an asset balance
    /// @dev Only available within this contract's context, i.e., adapters that are delegatecalled
    /// Can NOT check _amount against the actual ERC20 balance because any arbitrary amount
    /// of the ERC20 token could have been transferred to the Vault in another tx
    /// @param _asset The asset for which to decrease the assetBalance
    /// @param _amount The amount by which to decrease the assetBalance
    function decreaseAssetBalance(address _asset, uint256 _amount)
        external
        override
        onlyDelegated
    {
        __decreaseAssetBalance(_asset, _amount);
    }

    /// @notice Deposits an asset into the Vault
    /// @dev Only the Shares contract can call this function
    /// @param _asset The asset to deposit
    /// @param _amount The amount of the asset to deposit
    function deposit(address _asset, uint256 _amount) external override onlyShares {
        __increaseAssetBalance(_asset, _amount);
        __safeTransferFrom(_asset, msg.sender, address(this), _amount);
    }

    /// @notice Disable integration adapters from use in the fund
    /// @param _adapters The adapters to disable
    function disableAdapters(address[] calldata _adapters) external onlyManager {
        for (uint256 i = 0; i < _adapters.length; i++) {
            require(__adapterIsEnabled(_adapters[i]), "disableAdapters: adapter already disabled");
            EnumerableSet.remove(enabledAdapters, _adapters[i]);
            delete adapterToIntegrationInfo[_adapters[i]];
        }
        emit AdaptersDisabled(_adapters);
    }

    /// @notice Enable integration adapters from use in the fund
    /// @param _adapters The adapters to enable
    function enableAdapters(address[] calldata _adapters) external onlyManager {
        require(_adapters.length > 0, "enableAdapters: _adapters cannot be empty");
        __enableAdapters(_adapters);
    }

    /// @notice Get a list of enabled adapters
    /// @return An array of enabled adapter addresses
    function getEnabledAdapters() external view returns (address[] memory) {
        return EnumerableSet.enumerate(enabledAdapters);
    }

    /// @notice Retrieves the assets owned by the fund
    /// @return The addresses of assets owned by the fund
    function getOwnedAssets() external view override returns(address[] memory) {
        return ownedAssets;
    }

    /// @notice Increase an asset balance
    /// @dev Only available within this contract's context, i.e., adapters that are delegatecalled.
    /// Checks _amount against assetBalances[_asset] and the actual ERC20 balance.
    /// @param _asset The asset for which to increase the assetBalance
    /// @param _amount The amount by which to increase the assetBalance
    function increaseAssetBalance(address _asset, uint256 _amount)
        external
        override
        onlyDelegated
    {
        require(
            IERC20(_asset).balanceOf(address(this)) >= add(assetBalances[_asset], _amount),
            "increaseAssetBalance: Actual ERC20 balance is lower than new asset balance"
        );

        __increaseAssetBalance(_asset, _amount);
    }

    /// @notice Withdraw an asset from the Vault
    /// @dev Only the Shares contract can call this function
    /// @param _asset The asset to withdraw
    /// @param _amount The amount of the asset to withdraw
    function withdraw(address _asset, uint256 _amount) external override onlyShares {
        __decreaseAssetBalance(_asset, _amount);
        __safeTransfer(_asset, msg.sender, _amount);
    }

    // PUBLIC FUNCTIONS

    /// @notice Universal method for calling third party contract functions through adapters
    /// @dev Refer to specific adapter to see how to encode its arguments
    /// @param _adapter Adapter of the integration on which to execute a call
    /// @param _methodSignature Method signature of the adapter method to execute
    /// @param _encodedArgs Encoded arguments specific to the adapter
    function callOnIntegration(
        address _adapter,
        string memory _methodSignature,
        bytes memory _encodedArgs
    )
        public // TODO: leaving as public because it will need this for multiCallOnIntegration
        onlyManager
    {
        require(
            __getHub().status() == IHub.FundStatus.Active,
            "callOnIntegration: Hub must be active"
        );
        require(
            __adapterIsEnabled(_adapter),
            "callOnIntegration: Adapter is not enabled for fund"
        );

        // TODO: add PolicyManager().preValidate(_adapter, _integrationType, _sendAssets, _receiveAssets, _thirdParties)
        // Get ^this info from virtual adapter function

        (bool success, bytes memory returnData) = _adapter.delegatecall(
            abi.encodeWithSignature(
                _methodSignature,
                adapterToIntegrationInfo[_adapter].gateway,
                _encodedArgs
            )
        );
        require(success, string(returnData));

        // TODO: add PolicyManager().postValidate...
    }

    // PRIVATE FUNCTIONS
    /// @notice Check is an adapter is enabled for the fund
    function __adapterIsEnabled(address _adapter) private view returns (bool) {
        return EnumerableSet.contains(enabledAdapters, _adapter);
    }

    /// @notice Adds an asset to a fund's ownedAssets
    function __addAssetToOwnedAssets(address _asset) private {
        require(
            ownedAssets.length < MAX_OWNED_ASSETS,
            "Max owned asset limit reached"
        );
        ownedAssets.push(_asset);
        emit AssetAdded(_asset);
    }

    /// @notice Decreases the balance of an asset in a fund's internal system of account
    function __decreaseAssetBalance(address _asset, uint256 _amount) private {
        require(_amount > 0, "__decreaseAssetBalance: _amount must be > 0");
        require(_asset != address(0), "__decreaseAssetBalance: _asset cannot be empty");

        uint256 oldBalance = assetBalances[_asset];
        require(
            oldBalance >= _amount,
            "__decreaseAssetBalance: new balance cannot be less than 0"
        );

        uint256 newBalance = sub(oldBalance, _amount);
        if (newBalance == 0) __removeFromOwnedAssets(_asset);
        assetBalances[_asset] = newBalance;

        emit AssetBalanceUpdated(_asset, oldBalance, newBalance);
    }

    /// @notice Enable adapters for use in the fund
    /// @dev Fails if an already-enabled adapter is passed;
    /// important to assure Integration Info is not unintentionally updated from Registry
    function __enableAdapters(address[] memory _adapters) private {
        IRegistry registry = __getRegistry();
        for (uint256 i = 0; i < _adapters.length; i++) {
            require(
                registry.integrationAdapterIsRegistered(_adapters[i]),
                "__enableAdapters: Adapter is not on Registry"
            );
            require(
                !__adapterIsEnabled(_adapters[i]),
                "__enableAdapters: Adapter is already enabled"
            );

            // Pull adapter info from registry
            adapterToIntegrationInfo[_adapters[i]] = IntegrationInfo({
                gateway: registry.adapterToIntegrationInfo(_adapters[i]).gateway,
                typeIndex: registry.adapterToIntegrationInfo(_adapters[i]).typeIndex
            });
            EnumerableSet.add(enabledAdapters, _adapters[i]);
        }
        emit AdaptersEnabled(_adapters);
    }

    /// @notice Increases the balance of an asset in a fund's internal system of account
    function __increaseAssetBalance(address _asset, uint256 _amount) private {
        require(_amount > 0, "__increaseAssetBalance: _amount must be > 0");
        require(_asset != address(0), "__increaseAssetBalance: _asset cannot be empty");

        uint256 oldBalance = assetBalances[_asset];
        if (oldBalance == 0) __addAssetToOwnedAssets(_asset);
        uint256 newBalance = add(oldBalance, _amount);
        assetBalances[_asset] = newBalance;

        emit AssetBalanceUpdated(_asset, oldBalance, newBalance);
    }

    /// @notice Removes an asset from a fund's ownedAssets
    function __removeFromOwnedAssets(address _asset) private {
        for (uint256 i; i < ownedAssets.length; i++) {
            if (ownedAssets[i] == _asset) {
                ownedAssets[i] = ownedAssets[ownedAssets.length - 1];
                ownedAssets.pop();
                break;
            }
        }
        emit AssetRemoved(_asset);
    }
}

contract VaultFactory {
    function createInstance(address _hub, address[] calldata _adapters)
        external
        returns (address)
    {
        return address(new Vault(_hub, _adapters));
    }
}
