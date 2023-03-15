To run locally, make sure you have npm install http-server -g.


Then run http-server in local directory


## Challenges Faced

- **API Gateway to Lambda connection**: The learning curve for building an AWS CRUD application was steep, particularly when connecting API Gateway to Lambda and managing CORS headers. The static S3 hosting initially raised concerns about potential issues with the origin domain.

- **Database choice**: After extensive experimentation, the decision was made to move from MySQL to DynamoDB. DynamoDB's convenience and seamless integration with other AWS services proved more advantageous.

- **IAM roles and custom policies**: Proper configuration of IAM roles and custom policies was a major challenge. Ensuring the Lambda function had the necessary access to various resources required careful planning and implementation.

- **CORS IS a headache**: I tested my API with Postman multiple times and it was a somewhat gruesome process as I kept sawing internal errors (502) and (400). But once you get the hang of it, it makes sense. 



## Future Enhancements

- **Google OAuth integration**: To improve user authentication and provide a more streamlined user experience, the integration of Google OAuth is being considered for future enhancements.

## Adding a New Method to Your AWS Serverless Application By Kevin 
1. **Database Setup**: Determine if you need to create a new table or if you can use an existing one. If you need to create a new table, remember to update the IAM policies for your Lambda role to allow access to the new table.

2. **Lambda Function**: Update the Lambda function to include the new database, if necessary. Add the new method and its corresponding logic, ensuring that the correct table is being used for the operation.

3. **API Gateway Configuration**: Create a new resource and method in API Gateway for the new operation. Configure the integration type (e.g., Lambda) and set up any necessary mappings.

4. **Enable CORS**: Enable CORS for the new method in API Gateway to allow cross-origin requests. Ensure that the allowed headers and methods are set correctly.

5. **Deployment**: Deploy the updated API to create a new stage or update an existing one.

6. **Frontend/Backend Connections**: Check your frontend and backend to make sure your API address is set correctly, and you're passing the correct headers in the requests.

7. **Testing and Debugging**: Test the new method to verify it works as expected. If you encounter any errors, use the CloudWatch logs to help diagnose and resolve issues.
