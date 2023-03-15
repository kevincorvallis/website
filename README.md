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

1. **Plan the database**: Determine if you need to create a new table or if you can use an existing one. If you need to create a new table, make sure to set it up with the correct schema and attributes.

2. **Update IAM roles and policies**: Ensure that the Lambda function's IAM role has the necessary access permissions to interact with the new or updated database. Update the custom policy with the appropriate permissions for the new method.

3. **Modify the Lambda function**: Add the new method to your Lambda function. This may involve creating a new function or modifying an existing one to accommodate the new method.

4. **Create or update the API Gateway Resource**: In the API Gateway console, create a new Resource or update an existing one to map to the new method. Configure the Method Request, Integration Request, Integration Response, and Method Response settings as needed.

5. **Enable CORS**: Make sure to enable CORS for the new method by updating the necessary headers and allowed origins in the API Gateway console.

6. **Deploy the API**: Deploy the updated API to your chosen stage, such as "prod" or "dev," to make the new method available for use.

7. **Update the frontend**: Modify the frontend code to use the new method by updating the API address and ensuring the correct headers are passed in the request.

8. **Test and debug**: Test the new method using a tool like Postman, and review the logs in CloudWatch for any errors or issues. Debug and resolve any problems you encounter.

9. **Document the changes**: Update your documentation to include the new method, its purpose, and any important details for future reference.
