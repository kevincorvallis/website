using System;
using System.Data;
using MySql.Data.MySqlClient;

namespace Backend
{
    public class Db
    {
        private MySqlConnection conn;

        public Db(string connectionString = "Server=database-1.cwzjhkgs6o1v.us-west-1.rds.amazonaws.com;Database=journalDB;User ID=klee;Password=dlfrlTmsmsskfdldi;")
        {
            conn = new MySqlConnection(connectionString);
        }
        public void Open()
        {
            if (conn.State != ConnectionState.Open)
            {
                conn.Open();
            }
        }

        public void Close()
        {
            if (conn.State != ConnectionState.Closed)
            {
                conn.Close();
            }
        }

        public int ExecuteNonQuery(string sql)
        {
            using (var cmd = new MySqlCommand(sql, conn))
            {
                return cmd.ExecuteNonQuery();
            }
        }

        public object ExecuteScalar(string sql)
        {
            using (var cmd = new MySqlCommand(sql, conn))
            {
                return cmd.ExecuteScalar();
            }
        }

        public DataTable ExecuteQuery(string sql)
        {
            using (var cmd = new MySqlCommand(sql, conn))
            {
                var dt = new DataTable();
                var da = new MySqlDataAdapter(cmd);
                da.Fill(dt);
                return dt;
            }
        }
        public void InsertPrompt(string promptText)
        {
            using (var conn = new SqlConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand("INSERT INTO Prompts (PromptText) VALUES (@PromptText)", conn))
                {
                    cmd.Parameters.AddWithValue("@PromptText", promptText);
                    cmd.ExecuteNonQuery();
                }
            }
        }
    }
}
