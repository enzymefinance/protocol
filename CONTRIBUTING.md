# Melon Contribution Guidelines

As an open source project, we will consider changes to the code base from the community via pull requests. This document contains the guidelines for submission.

## Pull requests and reviews

The main branch that development work occurs on is the `develop` branch. It is usually encouraged to branch from there, and make pull requests back to `develop` when the change is made.

When making a pull request, please:

- Follow the "Git Branching Model" outlined in this document
- Follow the "Style Guide" outlined in this document
- Add tests that cover newly introduced code
- Format your code (using prettier) by running `yarn format`
- Lint your code (using solhint) by running `yarn lint`
- Make a comment in the pull request that includes any breaking changes to solidity code
- Make the pull request against the `develop` branch

When a pull request is created, one of the maintainers will review the code, and incorporate it into the relevant branch.

## Git Branching Model

Please always make PRs into the `develop` branch.

We follow this [Git branching model](http://nvie.com/posts/a-successful-git-branching-model/).

Each branch name should be prefixed with either `feature/`, `fix/`, `refactor/`, `chore/`, `test/`, or `docs/` depending on the type of work that is being done:

- `feature/my-branch` (for code that adds production functionality, solidity only)
- `fix/my-branch` (for fixing existing production code, solidity only)
- `refactor/my-branch` (for refactoring production code, solidity only)
- `chore/my-branch` (for updating linters, deployment utils, etc)
- `test/my-branch` (for adding, fixing, or updating tests and test helpers)
- `docs/my-branch` (for documentation additions or changes)

## Style Guide

The purpose of this style guide is to increase consistency within and between our contracts.
This makes them more legible, thereby helping maintain a high level of security.

### Tools

Some of our style choices are enforceable by a linter and formatting rules.

Using a linter is not a substitute for understanding the style guide, however, since some of our style choices do not have rules that can be enforced by these linters yet.

#### Solhint

We use [solhint](https://github.com/protofire/solhint) for linting Solidity code. We extend solhint's [recommended rules](https://github.com/protofire/solhint/blob/master/docs/rules.md) with a few of our own, which can be found in `.solhint.json`.

#### Prettier

We use [prettier](https://prettier.io/) for formatting both Solidity and TypeScript code, in order to standardize formatting practices. It is recommended to install a plugin for your text editor such as [this one](https://github.com/prettier/prettier-vscode) for VSCode, which can be configured to apply formatting on save.

### Solidity

Please adhere to the recommended [official Solidity style guide for v0.6.12](https://solidity.readthedocs.io/en/v0.6.12/style-guide.html), in addition to the following styling choices:

#### State variables

- All state vars and all functions should be `private` by default, unless they are meant to be inherited (in which case they are `internal`)
- State getter functions should be named as `getXXX`
- State setter functions should be named as `setXXX`
- All state vars that should be easily verifiable (most state vars) should have a simple getter

#### Functions

- Function, modifier, and event _parameters_ are _prefixed_ with an underscore, e.g., `_myParameter`
- Function, modifier, and event _return values_ are _suffixed_ with an underscore, e.g., `myReturnValue_`
- Always use named return values, but also always explicitly use `return`, i.e., `return (myValue1_, myValue2_)`. It is redundant, but it is performant and easier to review explicit return values.
- Non-externally visible _functions_ (`internal` and `private` visibility) are _prefixed_ with a double underscore, e.g., `__myInternalFunction()`
- Functions that perform and return calculations should be named as `calcXXX`
- Functions that verify conditions and return a boolean should be named as `isXXX`

#### Interfaces

- An `interface` for a contract should be prefixed with an `I`, e.g., `IMyContract`
- Interface files should only include the minimal functions that are required by other protocol contracts. They are not complete representations of the contract interface.
- Any contract that has functions that are dependencies of other contracts must inherit an interface and `override` the required functions, i.e., `MyContract is IMyContract`.

#### Natspec comments

We use [Natspec](https://github.com/ethereum/wiki/wiki/Ethereum-Natural-Specification-Format) annotations, which can be parsed to generate documentation.

We use thorough Natspec annotations for all externally-visible functions (i.e., `external` and `public`), and generally only a simple `@dev` annotation for internally-visible functions (i.e., `internal` and `private`).

We use `///` for multi-line comments rather than `/* */`.

Do not include `@notice` or `@dev` multiple times in the same block.

Annotations should be in this order:

```solidity
/// @notice Send tokens to another address, and get back the balances before/after balances
/// @param _toAddress The address to receive funds
/// @return oldBalance_ The balance before sending funds
/// @return newBalance_ The balance after sending funds
/// @dev Some comment intended for developers
function sendFunds(address _toAddress) external
    returns (uint256 oldBalance_, uint256 newBalance_)
{
    oldBalance_ = balance;
    ...
    newBalance_ = __calcNewBalance(oldBalance_);
}

/// @dev Helper to calculate the new balance after sending funds
function __calcNewBalance(uint256 _oldBalance) private
    returns (uint256 newBalance_)
{
    ...
}
```

#### Misc

- Max line length: 99
- `require()` statements must include a helpful message
- Data types should be explicitly defined, e.g., `uint256` instead of `uint`

Should there no explicitly mentioned rule please follow the _[GOLDEN RULE](https://github.com/ethereum/cpp-ethereum/blob/b6218fc1da39994043f1c43185bb24e364382d84/CodingStandards.txt#L3): Follow the style of the existing code when you make changes._
