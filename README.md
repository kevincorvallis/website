# klee.page

An on-going personal project. 

## Running the Application Locally

To run locally, make sure you have `npm install http-server -g`.

Then run `http-server` in local directory.

## Challenges and Solutions

### API Gateway and Lambda connection

**Challenge:** The learning curve for building an AWS CRUD application was steep, especially when it came to connecting API Gateway with Lambda functions and managing CORS headers. As the website was hosted statically via S3, concerns arose about potential issues with the origin domain.

**Solution:** Overcoming this challenge required experimentation, adjusting configurations, and ensuring the correct headers were passed between the services. This allowed for seamless communication between the API Gateway and Lambda functions.

### Database choice

**Challenge:** Initially, MySQL was chosen as the primary database for the project. However, after extensive experimentation and weighing the pros and cons, the decision was made to switch to DynamoDB.

**Solution:** The primary reason for this change was DynamoDB's convenience and seamless integration with other AWS services, which provided a more robust and efficient solution. This made managing and scaling the database easier, allowing the project to better adapt to future requirements.

### IAM roles and custom policies

**Challenge:** Proper configuration of IAM roles and custom policies was a major challenge. Ensuring the Lambda function had the necessary access to various resources required careful planning and implementation.

**Solution:** This issue was addressed by thoroughly reviewing and updating IAM roles and policies to ensure the correct access levels were granted. This allowed the Lambda function to interact with the necessary resources without compromising security.

### CORS and API testing

**Challenge:** During API testing with Postman, several internal errors (502 and 400) were encountered, causing difficulties in validating the API's functionality.

**Solution:** Understanding and managing CORS headers played a crucial role in resolving these issues. By configuring the API Gateway and Lambda functions correctly, a smooth and error-free testing process was achieved.

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
