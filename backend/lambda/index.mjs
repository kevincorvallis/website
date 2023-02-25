import mysql from 'mysql';

// Create a connection to the MySQL database
const connection = mysql.createConnection({
  host: 'database-1.cwzjhkgs6o1v.us-west-1.rds.amazonaws.com',
  user: 'klee',
  password: 'dlfrlTmsmsskfdldi',
  database: 'journalDB'
});

exports.handler = async (event, context) => {
  const { prompt, entry } = JSON.parse(event.body);

  // Insert the journal entry into the database
  const sql = 'INSERT INTO entries (prompt, entry) VALUES (?, ?)';
  const params = [prompt, entry];
  connection.query(sql, params, (error, results) => {
    if (error) {
      console.error(error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal server error' })
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Journal entry saved successfully' })
      };
    }
  });
};
