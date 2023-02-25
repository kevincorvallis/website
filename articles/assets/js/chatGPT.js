var prompts = [
  "What are you grateful for today?",
  "Describe a moment from today that made you happy.",
  "What did you learn today?",
  "What is something that challenged you today?",
  "Write about a person who inspires you.",
  // Add more prompts as needed
];

function generatePrompt() {
  // Generate a random index number
  var randomIndex = Math.floor(Math.random() * prompts.length);
  // Get the prompt at the generated index
  var prompt = prompts[randomIndex];
  // Set the prompt text to the generated prompt
  document.getElementById("prompt-text").innerHTML = prompt;
}

function addPrompt() {
  // Get the user's prompt from the input field
  var userPrompt = document.getElementById("user-prompt").value;
  // Add the user's prompt to the prompts array
  prompts.push(userPrompt);
  // Clear the input field
  document.getElementById("user-prompt").value = "";
  // Notify the user that their prompt was added
  alert("Your prompt was added!");
}