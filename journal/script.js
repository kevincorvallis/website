document.addEventListener("DOMContentLoaded", function() {
    const container = document.querySelector(".container");

    // This function updates the content of the container.
    const showContent = (title, content) => {
        container.classList.add("fade-out");
    
        setTimeout(() => {
            container.innerHTML = `
                <h1>${title}</h1>
                ${content}
            `;
            container.classList.remove("fade-out");
    
            if(title === "Welcome to Journaling") {
                document.getElementById("backBtn").style.display = "none";
            } else {
                document.getElementById("backBtn").style.display = "block";
            }
        }, 500);
    }

    const prompts = [
        { label: "First Name", id: "userFirstName", buttonId: "submitFirstName" },
        { label: "Last Name", id: "userLastName", buttonId: "submitLastName" },
        { label: "Email", id: "userEmail", type: "email", buttonId: "submitEmail" },
        { label: "Date of Birth", id: "userDOB", type: "date", buttonId: "submitDOB" },
        { label: "UserID", id: "userID", buttonId: "submitUserID" },
        { label: "Address", id: "userAddress", buttonId: "submitAddress" },
        { label: "Phone Number", id: "userPhone", type: "tel", buttonId: "submitPhone" }
    ];
    
    let currentPromptIndex = 0;
    let userData = {};
    
    document.getElementById("firstTime").addEventListener("click", function() {
        showNextPrompt();
    });
    
    container.addEventListener("click", function(event) {
        if (event.target.id === prompts[currentPromptIndex].buttonId) {
            userData[prompts[currentPromptIndex].id] = document.getElementById(prompts[currentPromptIndex].id).value;
            currentPromptIndex++;
    
            if (currentPromptIndex < prompts.length) {
                showNextPrompt();
            } else {
                saveToDynamoDB(userData);
            }
        }
    });
    
    function showNextPrompt() {
        const prompt = prompts[currentPromptIndex];
        showContent(`Enter your ${prompt.label}`, getPrompt(prompt.label, prompt.id, prompt.type || "text", prompt.buttonId));
    }
    
    function getPrompt(label, inputId, type, buttonId) {
        return `
            <p>What's your ${label}?</p>
            <input type="${type}" id="${inputId}" placeholder="Enter your ${label}" />
            <button id="${buttonId}">Next</button>
        `;
    }
    

    document.getElementById("returningUser").addEventListener("click", function() {
        showContent("Welcome Back!", "<p>This is the next page content for returning users.</p>");
    });

    document.getElementById("backBtn").addEventListener("click", function() {
        showContent("Welcome to Journaling", `
            <div class="buttons">
                <div class="g-signin2" data-onsuccess="onSignIn"></div>
                <button id="firstTime">First time here</button>
                <button id="returningUser">I've been here</button>
            </div>
        `);
    });
});

async function saveToDynamoDB(userData) {
    try {
        // Construct the request body
        const requestBody = {
            routeKey: "PUT /users",
            body: {
                email: userData.userEmail,
                userid: userData.userID, // Ensure you have this userID field in your userData
                firstName: userData.userFirstName,
                lastName: userData.userLastName,
                dateOfBirth: userData.userDOB,
                address: userData.userAddress, // Assuming Address is an object with a Street property
                phoneNumber: userData.userPhone
            }
        };

        // Send the request to the API Gateway endpoint
        const response = await fetch('https://twr7x5bzvf.execute-api.us-west-2.amazonaws.com/users', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();

        if (data.statusCode === 200) {
            showContent("Thanks!", "<p>Your data has been saved successfully!</p>");
            return;
        } else {
            alert(`There was an error saving your data: ${data.body}`);
        }
    } catch (error) {
        alert(`There was an error: ${error.message}. Please try again.`);
    }
}


// get rid of userID