CREATE TABLE journal_entries (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    text VARCHAR(500) NOT NULL,
    PRIMARY KEY (id)
);


CREATE TABLE prompts (
  id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prompt TEXT NOT NULL
);