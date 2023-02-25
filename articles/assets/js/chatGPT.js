function generatePrompt() {
  // Make an HTTP GET request to retrieve a random prompt
  $.ajax({
    url: 'https://sx6t6c5ma8.execute-api.us-west-1.amazonaws.com/prod/lambdaJournal/prompt',
    headers: {
      'x-api-key': 'X4KCzuCA7u6XqdGSC8NIA9N3SV7h0aIO7cXC8GCW'
    },
    success: function(data) {
      // Display the prompt text in the page
      $('#prompt-text').text(data.prompt);
    },
    error: function() {
      alert('Error getting prompt');
    }
  });
}


function addPrompt() {
  // Get the user's prompt from the input field
  var userPrompt = $('#user-prompt').val();
  // Make an HTTP POST request to add the prompt to the database
  $.ajax({
    url: 'https://sx6t6c5ma8.execute-api.us-west-1.amazonaws.com/prod/lambdaJournal/prompt',
    method: 'POST',
    headers: {
      'x-api-key': 'X4KCzuCA7u6XqdGSC8NIA9N3SV7h0aIO7cXC8GCW'
    },
    data: {prompt: userPrompt},
    success: function() {
      // Clear the input field
      $('#user-prompt').val('');
      // Notify the user that their prompt was added
      alert('Your prompt was added!');
    },
    error: function() {
      alert('Error adding prompt');
    }
  });
}

function submitEntry() {
  // Get the user's input values from the form
  var title = $('#entry-title').val();
  var text = $('#entry-text').val();
  // Make an HTTP POST request to add the entry to the database
  $.ajax({
    url: 'https://sx6t6c5ma8.execute-api.us-west-1.amazonaws.com/prod/lambdaJournal/entry',
    method: 'POST',
    headers: {
      'x-api-key': 'X4KCzuCA7u6XqdGSC8NIA9N3SV7h0aIO7cXC8GCW'
    },
    data: {title: title, text: text},
    success: function() {
      // Clear the form fields
      $('#entry-title').val('');
      $('#entry-text').val('');
      // Notify the user that their entry was saved
      alert('Your entry was saved!');
    },
    error: function() {
      alert('Error submitting entry');
    }
  });
}
