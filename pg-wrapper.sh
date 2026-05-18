#!/bin/bash
export LD_LIBRARY_PATH=/home/z/my-project/node_modules/@embedded-postgres/linux-x64/native/lib:$LD_LIBRARY_PATH
exec /home/z/my-project/node_modules/@embedded-postgres/linux-x64/native/bin/initdb "$@"
