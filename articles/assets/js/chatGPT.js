function generatePrompt() {
            // Make an HTTP GET request to retrieve a random prompt
            $.get('https://sx6t6c5ma8.execute-api.us-west-1.amazonaws.com/prod/lambdaJournal/prompt', function(data) {
                // Display the prompt text in the page
                $('#prompt-text').text(data.prompt);
            });
        }

        function addPrompt() {
            // Get the user's prompt from the input field
            var userPrompt = $('#user-prompt').val();
            // Make an HTTP POST request to add the prompt to the database
            $.post('https://sx6t6c5ma8.execute-api.us-west-1.amazonaws.com/prod/lambdaJournal/prompt', {prompt: userPrompt}, function() {
                // Clear the input field
                $('#user-prompt').val('');
                // Notify the user that their prompt was added
                alert('Your prompt was added!');
            });
        }

        function submitEntry() {
            // Get the user's input values from the form
            var title = $('#entry-title').val();
            var text = $('#entry-text').val();
            // Make an HTTP POST request to add the entry to the database
            $.post('https://sx6t6c5ma8.execute-api.us-west-1.amazonaws.com/prod/lambdaJournal/entry', {title: title, text: text}, function() {
                // Clear the form fields
                $('#entry-title').val('');
                $('#entry-text').val('');
                // Notify the user that their entry was saved
                alert('Your entry was saved!');
            });
        }