#!/bin/bash

if [ "$#" -lt 1 ]; then
    echo "ERROR: absolute path to execute is required" >&2
    echo "usage: $0 <exec_path> [<args>]" >&2
    exit 1
fi

EXECPATH="$1"
shift #Remove EXECPATH from list of arguments

# Check if EXECPATH is an absolute path
if [[ "$EXECPATH" != /* ]]; then
    echo "ERROR: $EXECPATH is not an absolute path" >&2
    exit 1
fi

# Check if EXECPATH is a directory
if [ ! -d "$EXECPATH" ]; then
    echo "ERROR: $EXECPATH is not a directory" >&2
    exit 1
fi

ARGUMENTS=("$@")

for i in "${!ARGUMENTS[@]}"; do
    echo "Argument $i: ${ARGUMENTS[$i]}"
done