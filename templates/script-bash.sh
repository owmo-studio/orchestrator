#!/bin/bash

cleanup() {
    local exit_code=$1
    rm -rf "$TEMP_DIR"
    pkill -P $$
    exit $exit_code
}
trap 'cleanup $?' SIGINT SIGTERM ERR

TEMP_DIR=$(mktemp -d)

if [ "$#" -lt 1 ]; then
    echo "ERROR: absolute path to execute is required" >&2
    echo "usage: $0 <exec_path> [<args>]" >&2
    exit 1
fi

EXEC_DIR="$1"
shift #Remove EXEC_DIR from list of arguments

# Check if EXEC_DIR is an absolute path
if [[ "$EXEC_DIR" != /* ]]; then
    echo "ERROR: $EXEC_DIR is not an absolute path" >&2
    exit 1
fi

# Check if EXEC_DIR is a directory
if [ ! -d "$EXEC_DIR" ]; then
    echo "ERROR: $EXEC_DIR is not a directory" >&2
    exit 1
fi

ARGS=("$@")

for i in "${!ARGS[@]}"; do
    echo "ARG $i: ${ARGS[$i]}"
done
