// Connect to the MySQL database using the mysql library
const mysql = require('mysql');
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
const mysqlHost = 'journaldb.cwzjhkgs6o1v.us-west-1.rds.amazonaws.com';
const mysqlUser = 'klee';
const mysqlPassword = "dlfrlTmsmsskfdldi";

// Define the paths for the different API endpoints
const healthPath = '/health';
const promptPath = '/prompt';
const promptsPath = '/prompts';
const entryPath = '/entry';
const entriesPath = '/entries'; 
const userPath = '/user';
const defaultPath = '/default';

// Create a connection to the MySQL database
let conn;
(async () => {
    try {
      conn = await mysql.createConnection({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword,
        database: mysqlDatabase,
        connectTimeout: 5000
      });
      console.log('SUCCESS: Connection to RDS MySQL instance succeeded');
    } catch (error) {
      console.error('ERROR: Unexpected error: Could not connect to MySQL instance.');
      console.error(error);
      process.exit();
    }
  })();
  

// This is the main handler function that will be executed when an HTTP request is received.
exports.handler = async (event, context) => {
    console.log('Request event: ', event);
    let response;
    switch(true) {
        // If the request is for the health check, respond with a 200 OK
        case event.httpMethod === 'GET' && event.path === healthPath:
            response = buildResponse(200);
            break;
        // If the request is for getting a random prompt, call the getPrompt() function
        case event.httpMethod === 'GET' && event.path === promptsPath:
            response = await getPrompt();
            break;
        // If the request is for getting all journal entries, call the getEntries() function
        case event.httpMethod === 'GET' && event.path === entriesPath:
            response = await getEntries(event);
            break;
        // If the request is for adding a journal entry, call the addEntry() function
        case event.httpMethod === 'POST' && event.path === entryPath:
            response = await addEntry(event);
            break;
        // If the request is for adding a new prompt, call the addPrompt() function
        case event.httpMethod === 'POST' && event.path === promptPath:
            response = await addPrompt(event);
            break;

        // If the request is for adding a new user, call the addUser() function
        case event.httpMethod === 'POST' && event.path === defaultPath:
            response = await addUser(event);
            break;
        
        // ========Ther will be more cases for the other API endpoints here. ========
        
        // If the request is not recognized, respond with a 404 Not Found
        default:
            response = buildResponse(404, {message: '404 Not found'});
            break;
        
    }
}

// Helper function to build an HTTP response
function buildResponse(statusCode, body) {
    let data = body;
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(data),
    };
}

// Function to get a random prompt
async function getPrompt() {
    try {
        // Create a SQL query to get a random prompt from the prompts table
        const sql = 'SELECT * FROM ' + mysqlPrompts + ' ORDER BY RAND() LIMIT 1';
        // Use the connection to the MySQL database to run the query
        const result = await conn.query({
            sql: sql
        });
        // Return the result of the query
        return buildResponse(200, result);
    } catch (error) {
        console.error('Error getting random prompt: ', error);
        return buildResponse(500, { message: 'Error getting random prompt.' });
    }
}

// Function to get all journal entries
async function getEntries(event) {
    try {
        let sql = 'SELECT * FROM ' + mysqlEntries;
        const params = [];
        if (event.queryStringParameters && event.queryStringParameters.user_id) {
            sql += ' WHERE user_id = ?';
            params.push(event.queryStringParameters.user_id);
        }
        const [rows] = await conn.query(sql, params);
        return buildResponse(200, rows);
    } catch (error) {
        console.error('Error getting journal entries: ', error);
        return buildResponse(500, { message: 'Error getting journal entries.' });
    }
}

// Function to add a journal entry
async function addEntry(event) {
    try {
        // Parse the body of the request to get the JSON data
        const data = JSON.parse(event.body);
        // Create a SQL query to insert the data into the journal_entries table
        const sql = 'INSERT INTO ' + mysqlEntries + ' (user_id, date, title, text, prompt_id) VALUES (?, ?, ?, ?, ?)';
        // Use the connection to the MySQL database to run the query
        const result = await conn.query({
            sql: sql,
            parameters: [data.user_id, data.date, data.title, data.text, data.prompt_id]
        });
        // Return the result of the query
        return buildResponse(200, result);
    } catch (error) {
        console.error('Error adding journal entry: ', error);
        return buildResponse(500, { message: 'Error adding journal entry.' });
    }
}

// Function to add a new prompt
async function addPrompt(event) {
    try {
        // Parse the body of the request to get the JSON data
        const data = JSON.parse(event.body);
        // Create a SQL query to insert the data into the prompts table
        const sql = 'INSERT INTO ' + mysqlPrompts + ' (prompt, user_id) VALUES (?, ?)';
        // Use the connection to the MySQL database to run the query
        const result = await conn.query({
            sql: sql,
            parameters: [data.prompt, data.user_id]
        });
        // Return the result of the query
        return buildResponse(200, result);
    } catch (error) {
        console.error('Error adding prompt: ', error);
        return buildResponse(500, { message: 'Error adding prompt.' });
    }
}

// Function to add a new user to the database 
async function addUser(event) {
    try {
      // Parse the body of the request to get the JSON data
      const data = JSON.parse(event.body);
      // Create a SQL query to insert the data into the users table
      const sql =
        "INSERT INTO " +
        mysqlUsers +
        " (username, password, email, created_at, updated_at, first_name, last_name, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      // Get the current timestamp for the created_at and updated_at fields
      const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
      // Use the connection to the MySQL database to run the query
      const result = await conn.query({
        sql: sql,
        parameters: [
          data.username,
          data.password,
          data.email,
          timestamp,
          timestamp,
          data.first_name,
          data.last_name,
          data.gender,
        ],
      });
      // Return the result of the query
      return buildResponse(200, result);
    } catch (error) {
      // If there's an error, log it and return a 500 error response
      console.error("Error adding user: ", error);
      return buildResponse(500, {
        message: "Error adding user.",
        error: error,
      });
    }
  }
  

// ========There will be more functions for the other API endpoints here. ========
