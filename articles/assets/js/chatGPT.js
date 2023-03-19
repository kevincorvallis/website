var userId; // Declare a global variable to store the user ID



function addPrompt() {
  var customPrompt = $('#custom-prompt').val();
  var userEmail = $('#user-email').val();
  if (customPrompt.trim() === "") {
    alert("Please enter a non-empty prompt.");
    return;
  }

  $.ajax({
    url: 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/addprompt',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({ userId: userEmail, prompt: customPrompt }),
    success: function () {
      $('#custom-prompt').val(''); // Clear the input field
      alert('Your prompt was added!');
    },
    error: function () {
      alert('Error adding prompt');
    },
  });
}

function submitJournalEntry() {
  var userEmail = $('#user-email').val();
  var title = $('#entry-title').val();
  var text = $('#entry-text').val();
  addJournalEntry(userEmail, title, text);
}

function fetchPrompts() {
  $.ajax({
    url: 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/prompts',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    success: function (response) {
      // const prompts = JSON.parse(response);
      displayPrompts(response);
    },
    error: function () {
      console.error('Error fetching prompts');
    },
  });
}

function displayPrompts(prompts) {
  const promptContainer = $('#prompt-container');
  const promptList = $('<ul class="prompt-list"></ul>');
  prompts.forEach((prompt) => {
    const promptElement = $('<li class="prompt"></li>');
    promptElement.text(`[${prompt.userId}] ${prompt.prompt}`);
    promptList.append(promptElement);
  });
  promptContainer.append(promptList);
  promptContainer.css('overflow-y', 'scroll');
  promptContainer.css('height', '200px');
}