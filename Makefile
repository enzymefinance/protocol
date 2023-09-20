# See https://tech.davis-hansson.com/p/make
SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
.DEFAULT_GOAL := all

MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

ifndef VERBOSE
  MAKEFLAGS += --silent
endif

ifeq ($(origin .RECIPEPREFIX), undefined)
  $(error This Make does not support .RECIPEPREFIX. Please use GNU Make 4.0 or later)
endif
.RECIPEPREFIX = >

GIT := git
BUNX := bunx
CAST := cast
FORGE := forge

TESTS_DIR := tests
CONTRACTS_DIR := contracts
ARTIFACTS_DIR := artifacts
INTERFACES_FILE := $(TESTS_DIR)/interfaces/interfaces.txt
INTERFACES_DIR := $(TESTS_DIR)/interfaces/internal
INTERFACES_LICENSE_HEADER := // SPDX-License-Identifier: Unlicense
INTERFACES_PRAGMA := >=0.6.0 <0.9.0

.PHONY: help
help: ## Describe useful make targets
> grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "%-30s %s\n", $$1, $$2}'

.PHONY: all
all: install format build ## Run install, format & build (default)

.PHONY: install
install: ## Install all dependencies
> $(GIT) submodule update --init --recursive

.PHONY: build
build: artifacts interfaces ## Build all contract artifacts & interfaces

.PHONY: artifacts
artifacts: $(ARTIFACTS_DIR)/ ## Build all contract artifacts

.PHONY: interfaces
interfaces: $(INTERFACES_DIR)/ ## Generate interfaces for all contracts listed in interfaces.txt

.PHONY: test
test: ## Run the entire test suite
> $(FORGE) test

.PHONY: lint
lint: ## Check linting on all contract source files
> $(BUNX) solhint $(CONTRACTS_DIR)/**/*.sol $(TESTS_DIR)/**/*.sol
> $(FORGE) fmt --check $(CONTRACTS_DIR) $(TESTS_DIR)

.PHONY: format
format: ## Apply formatting to all contract source files
> $(FORGE) fmt $(CONTRACTS_DIR) $(TESTS_DIR)

.PHONY: clean
clean: ## Remove all untracked files and directories and bust any caches
> $(GIT) clean -dfX --exclude !**/.env* --exclude !**/deployments --exclude !**/cache
> $(FORGE) clean

$(ARTIFACTS_DIR)/: Makefile $(shell find $(CONTRACTS_DIR) -type f -name "*.sol")
> mkdir -p $(@D)
> # Remove this once the `forge build` command supports a more capable version of the `--skip` option.
> export FOUNDRY_TEST=this-directory-does-not-exist
> $(FORGE) build --sizes --extra-output-files abi
> touch $@

$(INTERFACES_DIR)/: Makefile $(INTERFACES_FILE) $(ARTIFACTS_DIR)/
> mkdir -p $(@D)
>
> # Remove all existing interfaces and abis.
> find $(INTERFACES_DIR) -type f -name "*.sol" -delete
> find $(INTERFACES_DIR) -type f -name "*.abi.json" -delete
>
> echo "Generating interfaces ..."
>
> # Read interfaces.txt line by line and use `cast interface` to generate the interfaces.
> while read -r line; do
>   # Skip empty lines and lines starting with `#`.
>   if [[ -z "$$line" || "$$line" == \#* ]]; then
>     continue
>   fi
>
>   # The line format is `output: input`.
>   output="$$(echo $$line | cut -d ':' -f1 | xargs)"
>   input="$$(echo $$line | cut -d ':' -f2 | xargs)"
>   if [[ -z "$$output" || -z "$$input" ]]; then
>     echo "Invalid line format in $(INTERFACES_FILE) ($$line)"
>     exit 1;
>   fi
>
>   # Extract the output name of the interface from the output path.
>   name="$$(basename $$output | cut -d '.' -f1)"
>   if [[ -z "$$name" ]]; then
>     echo "Invalid output $$output in $(INTERFACES_FILE)"
>     exit 1
>   fi
>
>   # Prepend the interfaces directory to the output path and check the file extension.
>   output="$(INTERFACES_DIR)/$$output"
>   if [[ ! "$$input" == *.abi.json ]]; then
>     echo "Invalid extension for interface source $$input"
>     exit 1
>   fi
>
>   # If the input is a path, use it directly. Otherwise, try to find the file in the artifacts directory.
>   if echo "$$input" | grep -q "/"; then
>     path="$$input"
>   else
>     path="$$(find $(ARTIFACTS_DIR) -type f -name $$input | head -n 1)"
>   fi
>
>   # Check if the source file was found. If not, try alternative files based on a pattern (e.g. `Dispatcher.*.abi.json` instead of `Dispatcher.abi.json`).
>   if [[ -z "$$path" || ! -f "$$path" ]]; then
>     alternative="$$(find $(ARTIFACTS_DIR) -type f -name "$$(basename $$input .abi.json).*.abi.json" | sort -Vr | head -n 1)"
>     if [[ -z "$$alternative" || ! -f "$$alternative" ]]; then
>       echo "Failed to locate source file for $$input"
>       exit 1
>     else
>       path="$$alternative"
>     fi
>   fi
>
>   # Create the parent directory.
>   mkdir -p "$$(dirname $$output)"
>
>   # Generate the interface using `cast interface`.
>   $(CAST) interface "$$path" -o "$$output" -n "$$name" --pragma "$(INTERFACES_PRAGMA)" > /dev/null
>
>   # Copy the abi file to the interfaces directory.
>   cp "$$path" "$$(dirname $$output)/$$name.abi.json"
>
>   # Add a license header to the generated interface.
>   echo -e "$(INTERFACES_LICENSE_HEADER)\n$$(cat $$output)" > $$output
> done < "$(INTERFACES_FILE)"
>
> touch $@
