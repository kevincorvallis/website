Klee Website - Backend

This repository contains the backend functionality for my website, including a Lambda function and a connection to a MySQL database. This backend code is responsible for managing user-generated journal prompts.

Requirements

To run the backend code, you'll need:

An AWS account
AWS CLI installed on your local machine
.NET 6 SDK installed on your local machine
Setup

To set up the backend code, follow these steps:

Create a new Lambda function in AWS, using the .NET 6 runtime.
Use the AWS CLI to publish the Lambda function code to AWS.
Create a new REST API in AWS API Gateway, with a POST method that triggers the Lambda function.
Create a new MySQL database in AWS RDS, and configure the connection string in the Lambda function code.
Use the AWS CLI to deploy the API Gateway stage.
Usage

To use the backend functionality, send a POST request to the API Gateway endpoint with the following JSON data:

json
Copy code
{
  "prompt": "Your journal prompt here."
}
The Lambda function will save the prompt to the MySQL database, and return a success message.

Troubleshooting

If you encounter any issues with the backend functionality, try the following:

Check that your AWS resources are configured correctly.
Check that your database connection string is correct.
Check that your Lambda function code is correct and has been published to AWS.
If you're still having issues, please contact us for support.

Contact

If you have any questions or concerns about the backend functionality, please contact us at kevinleems@outlook.com