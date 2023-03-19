const uniqueId = Date.now().toString();

function addPrompt() {
  const customPrompt = $('#custom-prompt').val();
  const userEmail = $('#user-email').val();
  const name = $("#user-name").val();

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
    data: JSON.stringify({ userId: uniqueId, prompt: customPrompt, userName: name, userEmail: userEmail}),
    success: function () {
      $('#custom-prompt').val(''); // Clear the input field
      alert("Thank you for submitting your prompt!");
    },
    error: function () {
      alert('Error adding prompt');
    },
  });
}

function submitJournalEntry() {
  const userEmail = $('#user-email').val();
  const title = $('#entry-title').val();
  const text = $('#entry-text').val();
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
      displayPrompts(response);
    },
    error: function () {
      console.error('Error fetching prompts');
    },
  });
}

async function displayPrompts(prompts) {
  const promptContainer = $('#prompt-container');
  const promptList = $('<ul class="prompt-list"></ul>');

  for (const prompt of prompts) {
    const promptElement = $('<li class="prompt language"></li>');
    const koreanPrompt = await translateText(prompt.prompt, 'ko');
    promptElement.attr('data-english', `${prompt.userName} - "${prompt.prompt}"`);
    promptElement.attr('data-korean', `${prompt.userName} - "${koreanPrompt}"`);
    promptList.append(promptElement);
  }

  promptContainer.append(promptList);
  promptContainer.css('overflow-y', 'scroll');
  promptContainer.css('height', '200px');
  setLanguage();
}


function generatePrompt() {
  const author = "Anonymous";
  const prompts = [
    "What was your favorite memory from the past week?",
    "What is something you've been wanting to try but haven't had the chance to?",
    "What have you been procrastinating on lately?",
    "What are some ways you can practice self-care today?",
    "What is something you're grateful for right now?",
    "What is a challenge you've recently overcome?",
    "What are some small steps you can take today to work towards your goals?",
    "What is something that's been weighing on your mind lately?",
    "What is something you can do to show kindness to someone else today?",
    "What is a lesson you've learned recently?",
    "What is something that inspires you?",
    "What is something you're looking forward to?",
    "What is a place you've always wanted to visit?",
    "What is something that's been bringing you joy lately?"
  ];

  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
  const prompt = `${author} suggests: ${randomPrompt}`;
  $('#prompt').text(prompt);
}

function showPromptDescription() {
  const modal = document.getElementById("add-prompt-modal");
  modal.style.display = "block";
}

window.onclick = function(event) {
  var modal = document.getElementById("add-prompt-modal");
  if (event.target == modal) {
    modal.style.display = "none";
  }
}


