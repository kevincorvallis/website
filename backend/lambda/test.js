
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
            response = await getEntries();
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
    let res = {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
              'x-api-key': 'X4KCzuCA7u6XqdGSC8NIA9N3SV7h0aIO7cXC8GCW',
              'Access-Control-Allow-Origin': '*',
              "Access-Control-Allow-Methods": '*',
              "Access-Control-Allow-Headers" : "Content-Type",
              "Access-Control-Allow-Credentials" : true 
        },
        body: JSON.stringify(data),
    };
    return res;
};

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
async function getEntries() {
    try {
        // Create a SQL query to get all entries from the journal_entries table
        const sql = 'SELECT * FROM ' + mysqlEntries;
        // Use the connection to the MySQL database to run the query
        const result = await conn.query({
            sql: sql
        });
        // Return the result of the query
        return buildResponse(200, result);
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

// Export the handler function so that it can be used by the Lambda function

