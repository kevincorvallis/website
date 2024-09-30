document.addEventListener('DOMContentLoaded', function () {
    const adviceForm = document.getElementById('adviceForm');
    const responseMessage = document.getElementById('responseMessage');
    const adviceList2024 = document.getElementById('adviceList2024');

    // Handle form submission
    adviceForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        
        // Get the advice input
        const adviceInput = document.getElementById('adviceInput').value;
        
        try {
            // Make the POST request to the API
            const response = await fetch('https://your-api-endpoint.amazonaws.com/submit-advice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ advice: adviceInput }),
            });
            
            if (response.ok) {
                const result = await response.json();

                // Add the new advice to the DOM dynamically
                const newAdvice = document.createElement('div');
                newAdvice.classList.add('col-md-6');
                newAdvice.innerHTML = `
                    <div class="advice-card p-4 shadow-sm bg-dark text-white rounded">
                        <p class="fs-5">${adviceInput}</p>
                    </div>
                `;
                
                // Append the new advice to the 2024 section
                adviceList2024.appendChild(newAdvice);
                
                // Animate the new advice using GSAP
                gsap.from(newAdvice, { opacity: 0, y: 50, duration: 0.8 });

                // Show success message
                responseMessage.innerHTML = `<p class="text-success">Advice submitted successfully!</p>`;
                responseMessage.classList.add('animate__fadeIn');
                adviceForm.reset(); // Clear the form
            } else {
                responseMessage.innerHTML = `<p class="text-danger">Failed to submit advice. Please try again.</p>`;
            }
        } catch (error) {
            responseMessage.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        }
    });
});
