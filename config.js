// CONFIGURATION & VOCABULARY
const VOCAB = {
    openers: ["Alright.", "Got it.", "Okay.", "Processing...", "Checking.", "Executing.", "Computing now."],
    
    math_react: ["Result is", "Computed", "Equals", "Outcome is", "Calculated value is"],
    weather_intro: ["It looks like", "Current status in", "Forecast for", "Temperature in"],
    weather_outro: ["", "I hope you have an umbrella.", "It looks nice outside.", "Temperature logged."],
    wiki_intro: ["According to records", "I found data on", "Information suggests", "Archives show"],
    greetings: ["Hello.", "Hey.", "Greetings.", "System online."]
};

// Export for use in script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VOCAB };
}
