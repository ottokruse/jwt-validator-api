#!/bin/bash

# Exit after first failure
set -e

echo "tsc ..."
tsc

echo "sam package ..."
sam package \
    --template-file template.yaml \
    --output-template-file packaged.yaml \
    --s3-bucket sam.otto-aws.com

echo "sam deploy ..."
sam deploy \
    --template-file packaged.yaml \
    --stack-name jwt-validator \
    --capabilities CAPABILITY_IAM
