using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using MySql.Data.MySqlClient;
using Newtonsoft.Json;

// Define the lambda function entry point
public class Functions
{
    private static readonly MySqlConnection dbConn;

    static Functions()
    {
        string connString = "Server=database-1.cwzjhkgs6o1v.us-west-1.rds.amazonaws.com;Database=journalDB;User ID=klee;Password=dlfrlTmsmsskfdldi;";

        dbConn = new MySqlConnection(connString);
        dbConn.Open();
    }

    [LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]
    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request, ILambdaContext context)
    {
        context.Logger.LogLine("FunctionHandler invoked");

        try
        {
            // Get the HTTP method and request body from the API Gateway request
            string httpMethod = request.HttpMethod;
            string requestBody = request.Body;

            // Parse the request body as a JSON object
            dynamic body = JsonConvert.DeserializeObject(requestBody);

            // Get the journal prompt text from the request body
            string promptText = body.prompt;

            // Insert the prompt text into the database
            MySqlCommand cmd = new MySqlCommand();
            cmd.CommandText = "INSERT INTO prompts (prompt_text) VALUES (@PromptText)";
            cmd.Parameters.AddWithValue("@PromptText", promptText);
            cmd.Connection = dbConn;

            cmd.ExecuteNonQuery();

            // Return a success response
            var response = new APIGatewayProxyResponse
            {
                StatusCode = 200,
                Body = "{\"message\": \"Prompt saved successfully\"}"
            };

            return response;
        }
        catch (Exception ex)
        {
            // Log any errors and return an error response
            context.Logger.LogLine($"Error: {ex.Message}");
            var response = new APIGatewayProxyResponse
            {
                StatusCode = 500,
                Body = "{\"message\": \"Internal server error\"}"
            };

            return response;
        }
    }
}
