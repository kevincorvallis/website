const mysql = require('mysql');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
let AWS = require('aws-sdk');
// Define the names of the tables, database, and host

/*
Table Name: journal_entries 

Description:
A table representing individual journal entries made by users in the system.

Columns:
  - entry_id: an auto-incrementing integer used as a primary key
  - user_id: an integer used to identify the user who created the entry
  - date: a date field to store the date the entry was created
  - title: a string field to store the title of the journal entry
  - text: a text field to store the contents of the journal entry
  - prompt_id: an integer field used to associate the entry with a specific prompt from the prompts table. 
               This field is optional and can be left as NULL if the entry is not associated with a prompt.
  - created_at: a timestamp field to store the date and time the entry was created
  - updated_at: a timestamp field to store the date and time the entry was last updated
 */



const mysqlEntries = 'journal_entries';

/*
Table Name: prompts

Description: 
A table used to store prompts for journal entries. Each prompt has a prompt text, a unique ID, and the ID of the user who created it.

Columns:
 - prompt_id: An auto-incrementing integer used as the primary key for the table.
 - prompt: A text field used to store the text of the prompt.
 - user_id: An integer field used to identify the user who created the prompt.
 - created_at: A timestamp field used to store the date and time the prompt was created.
*/

const mysqlPrompts= 'prompts';

/**
Table Name: users

Description:
A table used to stores information about the users of the journaling application.
Columns: 
 - user_id: an auto-incrementing integer used as a primary key to uniquely identify each user
 - username: a string field to store the username of the user
 - password: a string field to store the hashed password of the user
 - email: a string field to store the email address of the user
 - created_at: a timestamp field to store the date and time the user account was created
 - updated_at: a timestamp field to store the date and time the user account was last updated
 - first_name:  a string field to store the first name of the user
 - last_name: a string field to store the last name of the user
 - gender: a string field to store the gender of the user
 */

const mysqlUsers = 'users';

const mysqlDatabase = 'journaldb';


// Define the paths for the different API endpoints
const healthPath = '/journalLambdafunc/health';
const promptPath = '/journalLambdafunc/prompt';
const promptsPath = '/journalLambdafunc/prompts';
const entryPath = '/journalLambdafunc/entry';
const entriesPath = '/journalLambdafunc/entries'; 
const userPath = '/journalLambdafunc/user';
const defaultPath = '/journalLambdafunc/default';



let conn;


exports.handler = async (event, context) => {        
    console.log("Starting query ...\n");
    
    var signer = new AWS.RDS.Signer({
        region: 'us-west-1', // example: us-east-2
        hostname: 'journalproxy.proxy-cwzjhkgs6o1v.us-west-1.rds.amazonaws.com',
        port: 3306,
        username: 'klee'
    });

    let token = signer.getAuthToken({
        username: 'klee'
    });

    console.log ("IAM Token obtained\n");

    let connectionConfig = {
        host: process.env.RDS_HOSTNAME,
        user: process.env.RDS_USERNAME,
        database: mysqlDatabase,
        ssl: { rejectUnauthorized: false},
        password: token,
        authSwitchHandler: function ({pluginName, pluginData}, cb) {
            console.log("Setting new auth handler.");
        }
      };

    // Adding the mysql_clear_password handler
    connectionConfig.authSwitchHandler = (data, cb) => {
        if (data.pluginName === 'mysql_clear_password') {
          // See https://dev.mysql.com/doc/internals/en/clear-text-authentication.html
          console.log("pluginName: "+data.pluginName);
          let password = token + '\0';
          let buffer = Buffer.from(password);
          cb(null, password);
        }
    };
    
    conn = mysql.createConnection(connectionConfig);
		
    conn.connect(function(err) {
        if (err) {
            console.log('error connecting: ' + err.stack);
            return;
        }
        
        console.log('connected as id ' + connection.threadId + "\n");
        });

    
    let response;

    switch(true) {
      case event.httpMethod === 'GET' && event.path === healthPath:
        response = buildResponse(200, {message: '200 HEALTH IS GOOD'});
        break;
        
      // If the request is for getting a random prompt, call the getPrompt() function
      case event.httpMethod === 'GET' && event.path === promptsPath:
        console.log('=========Invoking GETTING PROMPT !\n');
        response = await getPrompt();
        break;      
          
      default:
        response = buildResponse(404, {message: 'DEFAULT : 404 Not found'});
        break;
    }
    return response

}
// Function to get a random prompt
async function getPrompt() {
    try {
        // Create a SQL query to get a random prompt from the prompts table
        const sql = 'SELECT prompt FROM ' + mysqlPrompts + ' ORDER BY RAND() LIMIT 1';
        // Use the connection to the MySQL database to run the query
        console.log('Querying database...', conn);
        const result = await conn.query({
            sql: sql
        });
        console.log('Result:', result);
        // Return the result of the query
        return buildResponse(200, result);
    } catch (error) {
        console.error('Error getting random prompt: ', error);
        return buildResponse(500, { message: 'Error getting random prompt.' });
    }
}

// Helper function to build an HTTP response
function buildResponse(statusCode, body) {
    console.log('=========Inside buildResponse function!\n');

    let data = body;
    let res = {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              "Access-Control-Allow-Headers" : "Content-Type",
        },
        body: JSON.stringify(data),

    };

    return res;
};

