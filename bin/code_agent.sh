#!/bin/bash

# We are going to dump the lite version of the app, and the src file along with a tree to the console
tree -a -I 'node_modules|.git|.DS_Store|dist|dist-lite|dist-full'

find . -name '*.js' -not -path './node_modules/*' -not -path './dist/*' -not -path './dist-lite/*' -not -path './dist-full/*' -exec wc -l {} +

# QUIT FUCKING DELETEING THESE
list_files app-lite
list_files src

