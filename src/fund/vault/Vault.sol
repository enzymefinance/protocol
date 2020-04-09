pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/TokenUser.sol";
import "../../factory/Factory.sol";
import "../hub/Spoke.sol";
import "./IVault.sol";
import "./Trading.sol";

contract Vault is IVault, TokenUser, Spoke, Trading {
    event AssetAdded(address asset);

    event AssetBalanceUpdated(address indexed asset, uint256 oldBalance, uint256 newBalance);

    event AssetRemoved(address asset);

    uint256 constant public MAX_OWNED_ASSETS = 20; // TODO: Is this necessary? Should it be set here or at Registry or somewhere else?
    address[] public ownedAssets;
    mapping(address => uint256) public override assetBalances;

    modifier onlyDelegated() {
        require(
            msg.sender == address(this),
            "Only a delegated contract can make this call"
        );
        _;
    }

    modifier onlyShares() {
        require(
            msg.sender == hub.shares(),
            "Only the Shares contract can make this call"
        );
        _;
    }

    constructor(
        address _hub,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _registry
    )
        public
        Spoke(_hub)
        Trading(_exchanges, _adapters, _registry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Receive ether function (used to receive ETH from WETH)
    receive() external payable {}

    /// @notice Decrease an asset balance
    /// @dev Only available to this contract's context, i.e., adapters that are delegatecalled
    /// @dev Can NOT check _amount against the actual ERC20 balance because any arbitrary amount
    /// of the ERC20 token could have been transferred to the Vault in another tx
    /// @param _asset The asset for which to decrease the assetBalance
    /// @param _amount The amount by which to decrease the assetBalance
    function decreaseAssetBalance(address _asset, uint256 _amount)
        external
        override
        onlyDelegated
    {
        require(_amount > 0, "decreaseAssetBalance: _amount must be > 0");
        require(_asset != address(0), "decreaseAssetBalance: _asset cannot be empty");

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

    /// @notice Retrieves the assetBalances of all assets of the fund
    /// @return The assets owned by the fund
    /// @return The assetBalances of owned assets
    function getAllAssetBalances()
        external
        view
        override
        returns(address[] memory, uint256[] memory)
    {
        address[] memory assets = ownedAssets;
        uint256[] memory balances = new uint256[](assets.length);
        for (uint256 i = 0; i < assets.length; i++) {
            balances[i] = assetBalances[assets[i]];
        }

        return (assets, balances);
    }

    /// @notice Retrieves the number of owned assets in this fund
    /// @return The number of owned assets
    function getOwnedAssetsLength() external view override returns (uint256) {
        return ownedAssets.length;
    }

    /// @notice Increase an asset balance
    /// @dev Only available to this contract's context, i.e., adapters that are delegatecalled
    /// @dev Checks _amount against assetBalances[_asset] and the actual ERC20 balance
    /// @param _asset The asset for which to increase the assetBalance
    /// @param _amount The amount by which to increase the assetBalance
    function increaseAssetBalance(address _asset, uint256 _amount)
        external
        override
        onlyDelegated
    {
        require(_amount > 0, "increaseAssetBalance: _amount must be > 0");
        require(_asset != address(0), "increaseAssetBalance: _asset cannot be empty");

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

    /// @notice Increases the balance of an asset in a fund's internal system of account
    function __increaseAssetBalance(address _asset, uint256 _amount) private {
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

contract VaultFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address[] exchanges,
        address[] adapters
    );

    function createInstance(
        address _hub,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _registry
    )
        public
        returns (address)
    {
        address vault = address(new Vault(_hub, _exchanges, _adapters, _registry));
        childExists[vault] = true;
        emit NewInstance(
            _hub,
            vault,
            _exchanges,
            _adapters
        );
        return vault;
    }
}
