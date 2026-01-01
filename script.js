// --- 1. SETUP & STATE ---
const wrapper = document.getElementById('riri-wrapper');
const input = document.getElementById('user-input');
const chatHistory = document.getElementById('chat-history');
const ringText = document.getElementById('ring-text');

let globalScale = 1;
let clockInterval = null;
let swInterval = null;
let swStartTime = 0;
let swElapsedTime = 0;
let timerInterval = null;
let timerTime = 0;

// --- APPROACH 2: STATE MACHINE VARIABLES ---
let conversationState = "IDLE"; // Options: IDLE, WAITING_CITY, WAITING_NOTE, WAITING_MATH
let lastIntent = null;
let lastData = null; 

// --- 5. NEW: EXTERNAL DATA CHECK ---
// Check if custom-replies.js loaded successfully and provided the variable
// We do NOT try to load it here with fetch (to avoid async complexity/permissions issues),
// we trust that if the script tag in HTML loaded, the variable is available.
// If for some reason it's missing (null), the system handles it in the loop.

if (typeof customReplies === 'undefined' || customReplies === null) {
    console.warn("Custom Brain (custom-replies.js) not loaded. Using default replies.");
}

function initSystem() {
    // We removed LocalStorage loading because we now rely on the external file.
    // If the file didn't load, the 'if' statement above handles it gracefully.
    console.log("System Initialized. Custom Brain:", customReplies ? "Loaded" : "Missing");
}

// Call init on page load
window.addEventListener('DOMContentLoaded', initSystem);

// --- 2. INTERACTION (Drag Header, Resize Corner) ---
function setupPanelInteraction(panel) {
    let isDragging = false;
    let isResizing = false;
    let startX, startY, startLeft, startTop, startW, startH;

    const onStart = (e) => {
        const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        const target = e.target;

        if (target.classList.contains('resize-handle')) {
            isResizing = true;
            const rect = panel.getBoundingClientRect();
            startW = rect.width; startH = rect.height;
            startX = clientX; startY = clientY;
            e.preventDefault();
        } else if (target.closest('.panel-header')) {
            if (target.classList.contains('close-btn')) return;

            isDragging = true;
            const style = window.getComputedStyle(panel);
            const matrix = new WebKitCSSMatrix(style.transform);
            startLeft = matrix.m41; startTop = matrix.m42;
            startX = clientX; startY = clientY;
            
            // Bring to front
            document.querySelectorAll('.hud-panel').forEach(p => p.style.zIndex = 50);
            panel.style.zIndex = 51;

            e.preventDefault();
        }
    };

    const onMove = (e) => {
        if (!isDragging && !isResizing) return;
        
        const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);

        if (isResizing) {
            const newW = Math.max(150, startW + (clientX - startX));
            const newH = Math.max(100, startH + (clientY - startY));
            panel.style.width = newW + 'px';
            panel.style.height = newH + 'px';
        } else if (isDragging) {
            const dx = clientX - startX;
            const dy = clientY - startY;
            panel.style.transform = `translate(${startLeft + dx}px, ${startTop + dy}px)`;
        }
    };

    const onEnd = () => {
        isDragging = false;
        isResizing = false;
    };

    panel.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    
    panel.addEventListener('touchstart', onStart, {passive: false});
    window.addEventListener('touchmove', onMove, {passive: false});
    window.addEventListener('touchend', onEnd);
}

document.querySelectorAll('.hud-panel').forEach(setupPanelInteraction);

// GLOBAL ZOOM
let initialPinchDist = 0;
let initialGlobalScale = 1;

window.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
        initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialGlobalScale = globalScale;
    }
}, {passive: false});

window.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        globalScale = initialGlobalScale * (dist / initialPinchDist);
        if(globalScale < 0.5) globalScale = 0.5;
        if(globalScale > 3.0) globalScale = 3.0;
        updateWrapperTransform();
        e.preventDefault();
    }
}, {passive: false});

function updateWrapperTransform() {
    wrapper.style.transform = `translate(-50%, -50%) scale(${globalScale})`;
}

// --- 3. RESET SYSTEM ---
function resetHUD() {
    stopClock();
    stopStopwatch();
    stopTimer();
    
    document.querySelectorAll('.image-panel').forEach(p => p.remove());
    
    ['info-panel', 'math-panel', 'clock-panel', 'weather-panel', 
     'dice-panel', 'toss-panel', 'system-panel', 'news-panel', 'advice-panel', 'countries-panel'].forEach(id => {
        document.getElementById(id).classList.remove('active');
    });
}

function closePanel(id) {
    document.getElementById(id).classList.remove('active');
    if(id === 'timer-panel') stopTimer();
    if(id === 'stopwatch-panel') stopStopwatch();
}

function resetState() {
    conversationState = "IDLE";
    lastIntent = null;
    lastData = null; 
}

// --- 4. CALCULATOR LOGIC ---
const calcDisplay = document.getElementById('calc-display');
const calcGrid = document.getElementById('calc-grid');
const buttons = ['7','8','9','/','4','5','6','*','1','2','3','-','C','0','=','+'];
let calcStr = "";

buttons.forEach(btn => {
    const div = document.createElement('div');
    div.className = 'calc-btn';
    if(['/','*','-','+','C','='].includes(btn)) div.classList.add('op');
    if(btn === '=') div.classList.add('eq');
    div.innerText = btn;
    
    div.onclick = () => {
        if (btn === 'C') {
            calcStr = "";
            calcDisplay.innerText = "";
        } else if (btn === '=') {
            if(calcStr) {
                try {
                    const result = eval(calcStr);
                    typeRing(result.toString());
                    calcStr = result.toString();
                    calcDisplay.innerText = result;
                } catch {
                    typeRing("Error");
                }
            }
        } else {
            calcStr += btn;
            calcDisplay.innerText = calcStr;
        }
    };
    calcGrid.appendChild(div);
});

// --- 5. UI HELPERS ---
function typeRing(text) {
    stopClock();
    ringText.style.display = 'block';
    ringText.innerHTML = '<span class="cursor"></span>';
    let i = 0;
    function type() {
        if (i < text.length) {
            ringText.innerHTML = text.substring(0, i+1) + '<span class="cursor"></span>';
            i++;
            setTimeout(type, 20);
        } else {
            ringText.innerHTML = text;
        }
    }
    type();
}

function hideRing() {
    ringText.style.display = 'none';
    ringText.innerHTML = '';
}

function addToChat(text, sender) {
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function createImagePanel(src, title, x, y) {
    const panel = document.createElement('div');
    panel.className = 'hud-panel image-panel active';
    panel.style.width = '200px'; panel.style.height = '200px';
    panel.style.transform = `translate(${x}px, ${y}px)`;
    panel.innerHTML = `
        <div class="panel-header"><span>${title}</span></div>
        <div class="panel-content" style="padding:0"><img src="${src}" class="img-full" draggable="false"></div>
        <div class="resize-handle"></div>
    `;
    wrapper.appendChild(panel);
    setupPanelInteraction(panel);
}

// --- 6. NEW API FEATURES (Unchanged Logic, Robust) ---

// ADVICE API
async function fetchAdvice() {
    const textEl = document.getElementById('advice-text');
    textEl.innerText = "Thinking...";
    try {
        const res = await fetch('https://api.adviceslip.com/advice');
        const data = await res.json();
        textEl.innerText = data.slip.advice;
        addToChat("Advice fetched.", 'bot');
        typeRing(data.slip.advice);
        resetState();
    } catch(e) {
        textEl.innerText = "Failed to load advice.";
        addToChat("Advice Error.", 'bot');
        resetState();
    }
}

function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');
    document.getElementById('clock-panel').classList.add('active');
    
    function update() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        timeEl.innerText = timeStr;
        dateEl.innerText = dateStr;
        ringText.innerText = timeStr;
        ringText.style.display = 'block';
    }
    update();
    clockInterval = setInterval(update, 1000);
}
function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

async function getWeather(city) {
    document.getElementById('weather-panel').classList.add('active');
    const wTemp = document.getElementById('weather-temp');
    const wDesc = document.getElementById('weather-desc');
    const wLoc = document.getElementById('weather-loc');

    try {
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
        const res = await fetch(url);
        const data = await res.json();
        const current = data.current_condition[0];
        const area = data.nearest_area[0].areaName[0].value;
        
        wTemp.innerText = `${current.temp_C}°C`;
        wDesc.innerText = current.weatherDesc[0].value;
        wLoc.innerText = `Location: ${area}`;
        
        const reply = `${VOCAB.weather_intro[Math.floor(Math.random()*VOCAB.weather_intro.length)]} ${city} is ${current.temp_C}°C. ${VOCAB.weather_outro[Math.floor(Math.random()*VOCAB.weather_outro.length)]}`;
        addToChat(reply, 'bot');
        typeRing(`${current.temp_C}°C`);
        
        lastData = { city, temp: `${current.temp_C}°C` };
        resetState();
    } catch(e) {
        wDesc.innerText = "Connection failed";
        wLoc.innerText = "Try 'London'";
        wTemp.innerText = "--";
        addToChat("Weather API Error.", 'bot');
        resetState();
    }
}

async function searchCountries(name) {
    document.getElementById('countries-panel').classList.add('active');
    const container = document.getElementById('countries-content');
    container.innerHTML = '<div style="text-align:center">Searching...</div>';
    
    try {
        const url = `https://restcountries.com/v3.1/name/${name}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if(data.status === 404 || data.length === 0) {
            container.innerHTML = '<div style="text-align:center">Country not found.</div>';
            resetState();
            return;
        }

        const c = data[0];
        container.innerHTML = `
            <div style="text-align:center;">
                <img src="${c.flags.svg}" class="country-flag">
            </div>
            <div class="country-details">
                <h3>${c.name.common}</h3>
                <p><strong>Capital:</strong> ${c.capital ? c.capital[0] : 'N/A'}</p>
                <p><strong>Population:</strong> ${c.population.toLocaleString()}</p>
                <p><strong>Region:</strong> ${c.region}</p>
                <p><strong>Subregion:</strong> ${c.subregion}</p>
            </div>
        `;
        
        const reply = `${VOCAB.wiki_intro[Math.floor(Math.random()*VOCAB.wiki_intro.length)]} ${c.name.common}. ${VOCAB.wiki_intro[Math.floor(Math.random()*VOCAB.wiki_intro.length)]}`;
        addToChat(reply, 'bot');
        resetState();
    } catch (e) {
        container.innerHTML = '<div style="text-align:center;color:red">API Failed.</div>';
        addToChat("Connection Error.", 'bot');
        resetState();
    }
}

// --- 7. FEATURE LOGIC ---

function startTimer() {
    if (timerInterval) return;
    
    let min = parseInt(document.getElementById('timer-min').value) || 0;
    let sec = parseInt(document.getElementById('timer-sec').value) || 0;
    timerTime = min * 60 + sec;
    if (timerTime <= 0) return;

    document.getElementById('timer-panel').classList.add('active');
    
    timerInterval = setInterval(() => {
        if (timerTime > 0) {
            timerTime--;
            const m = Math.floor(timerTime / 60);
            const s = timerTime % 60;
            document.getElementById('timer-display').innerText = 
                `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            ringText.innerText = document.getElementById('timer-display').innerText;
            ringText.style.display = 'block';
        } else {
            stopTimer();
            typeRing("Done");
            addToChat("Timer finished.", 'bot');
            resetState();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
function resetTimer() {
    stopTimer();
    timerTime = 0;
    document.getElementById('timer-display').innerText = "00:00";
}

// MUSIC
function toggleMusic() {
    const audio = document.getElementById('audio-player');
    const btn = document.getElementById('play-btn');
    if (audio.paused) {
        audio.play().catch(e => console.log("Interaction needed"));
        btn.innerText = "❚❚";
    } else {
        audio.pause();
        btn.innerText = "▶";
    }
}
function setVolume(val) {
    document.getElementById('audio-player').volume = val;
}

function startStopwatch() {
    const btn = document.getElementById('sw-start');
    if (swInterval) {
        stopStopwatch();
    } else {
        swStartTime = Date.now() - swElapsedTime;
        swInterval = setInterval(() => {
            swElapsedTime = Date.now() - swStartTime;
            const date = new Date(swElapsedTime);
            document.getElementById('sw-display').innerText = date.toISOString().substr(11, 8);
        }, 10);
        btn.innerText = "Stop";
        btn.classList.add('active');
    }
}
function resetStopwatch() {
    stopStopwatch();
    swElapsedTime = 0;
    document.getElementById('sw-display').innerText = "00:00:00";
    document.getElementById('sw-start').innerText = "Start";
}
function stopStopwatch() {
    if(swInterval) {
        clearInterval(swInterval);
        swInterval = null;
        document.getElementById('sw-start').innerText = "Start";
        document.getElementById('sw-start').classList.remove('active');
    }
}

// NEWS
async function fetchNews() {
    document.getElementById('news-panel').classList.add('active');
    const container = document.getElementById('news-content');
    container.innerHTML = '<div style="text-align:center">Fetching...</div>';
    
    try {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=http://feeds.bbci.co.uk/news/rss.xml`;
        const res = await fetch(url);
        const data = await res.json();
        
        container.innerHTML = '';
        data.items.slice(0, 8).forEach(item => {
            const div = document.createElement('div');
            div.className = 'news-item';
            div.innerHTML = `<div class="news-title">${item.title}</div><div class="news-date">${new Date(item.pubDate).toLocaleDateString()}</div>`;
            div.onclick = () => { window.open(item.link, '_blank'); };
            container.appendChild(div);
        });
        addToChat("News fetched.", 'bot');
        setCachedData('news', data); // Cache via local storage utility
        resetState();
    } catch (e) {
        container.innerHTML = '<div style="text-align:center;color:red">Failed to load news.</div>';
        addToChat("News error.", 'bot');
        resetState();
    }
}

// --- 8. BRAIN (Smart + External File Support) ---

// LEVEL 4: SENTIMENT ANALYSIS
function analyzeSentiment(text) {
    const positive = ['good', 'great', 'awesome', 'thanks', 'thank you', 'love', 'happy', 'cool', 'nice', 'yes'];
    const negative = ['bad', 'hated', 'stupid', 'fail', 'worst', 'ugly', 'no', 'idiot', 'error'];
    
    const score = (text.match(new RegExp(positive.join('|'), 'gi')) || []).length - 
                (text.match(new RegExp(negative.join('|'), 'gi')) || []).length;
    
    if (score > 0) return "POSITIVE";
    if (score < 0) return "NEGATIVE";
    return "NEUTRAL";
}

// LEVEL 1: PERSONALITY RESPONSES (Falls back to defaults if external file missing)
const knowledgeBase = {
    "who are you": ["I am Riri, your personal web assistant.", "I'm Riri, OS level 19.", "Your helper."],
    "who made you": ["A developer created me.", "Code is my creator.", "Humans."],
    "how are you": ["I am functioning optimally.", "Systems are stable.", "All systems go.", "I am just code."],
    "what can you do": "I can calculate, search info, play music, set timers, cache data, and more."
};

async function processQuery(query) {
    const q = query.toLowerCase().trim();
    addToChat(query, 'user');
    
    // 1. SYSTEM COMMANDS
    if (q === 'clear' || q === 'delete') {
        chatHistory.innerHTML = '';
        typeRing("Cleared");
        resetState();
        return;
    }
    if (q === 'cancel' || q === 'stop' || q === 'reset') {
        resetState();
        addToChat("Operation cancelled.", 'bot');
        typeRing("Idle");
        return;
    }
    if (q === 'help') {
        const helpText = "Time, Timer, Weather, News, Advice, Music, Notes, Dice, Toss, Calculator, Wiki, Math, Countries, System. Try 'Custom' to teach me replies.";
        typeRing("Help");
        addToChat(helpText, 'bot');
        resetState();
        return;
    }

    // IMPORTANT: Reset HUD visually (Keep Custom Panel if it was open? No, let's follow strict reset logic)
    resetHUD();
    hideRing();

    // 2. PRIORITY 1 - CHECK CUSTOM BRAIN (EXTERNAL FILE)
    // We iterate through the keys in customReplies.
    // If user query (q) contains ANY key in the custom object, we use it.
    // Note: customReplies is defined in custom-replies.js.
    let customMatchFound = false;
    
    if (typeof customReplies !== 'undefined' && customReplies !== null) {
        // Check if custom file loaded successfully
        if (Object.keys(customReplies).length > 0) {
            for (const key in customReplies) {
                if (q.includes(key)) {
                    // Found a custom response trigger
                    const responses = customReplies[key];
                    if (Array.isArray(responses) && responses.length > 0) {
                        // Pick a random response from the custom list
                        const reply = responses[Math.floor(Math.random() * responses.length)];
                        typeRing(reply);
                        addToChat(reply, 'bot');
                        customMatchFound = true;
                        resetState();
                        return; // STOP PROCESSING
                    }
                }
            }
        }
    }

    // 2. STATE MACHINE (Approach 2)
    
    // A. Handling Weather Context
    if (conversationState === "WAITING_CITY") {
        // User provided the city name (e.g., after Riri asked "Which city?")
        getWeather(q);
        return; 
    }

    // B. Handling Notes Context
    if (conversationState === "WAITING_NOTE") {
        document.getElementById('notes-panel').classList.add('active');
        const notesArea = document.getElementById('notes-area');
        notesArea.value += q + "\n";
        addToChat("Note added.", 'bot');
        typeRing("Note Saved");
        resetState();
        return;
    }

    // C. Handling Math Context
    if (conversationState === "WAITING_MATH") {
        const isMath = /^\d+[\+\-\*\/]\d+$/.test(q);
        if (isMath) {
            // User typed a math problem after Riri asked "Equation?"
            const result = eval(q);
            const reply = constructDynamicReply('math', result);
            addToChat(reply, 'bot');
            typeRing(result.toString());
            // Show math panel
            document.getElementById('math-panel').classList.add('active');
            document.getElementById('math-output').innerHTML = `
                <div class="math-line">Input: ${q}</div>
                <div class="math-result">= ${result}</div>
            `;
            resetState();
        } else {
            addToChat("Invalid math format.", 'bot');
            resetState();
        }
        return;
    }

    // 3. PERSISTENT TOGGLES
    if (q === 'calculator' || q === 'calc') {
        document.getElementById('calc-panel').classList.add('active');
        addToChat("Calculator Active.", 'bot');
        typeRing("Ready");
        resetState();
        return;
    }
    if (q === 'remove calculator' || q === 'close calculator') {
        closePanel('calc-panel');
        addToChat("Calculator closed.", 'bot');
        return;
    }
    if (q === 'notes' || q === 'note') {
        document.getElementById('notes-panel').classList.add('active');
        addToChat("Type your note content...", 'bot');
        typeRing("Listening...");
        conversationState = "WAITING_NOTE";
        return;
    }
    if (q === 'stopwatch') {
        document.getElementById('stopwatch-panel').classList.add('active');
        addToChat("Stopwatch.", 'bot');
        resetState();
        return;
    }
    if (q === 'music') {
        document.getElementById('music-panel').classList.add('active');
        addToChat("Music Player.", 'bot');
        resetState();
        return;
    }

    // 4. FEATURES & STATE TRIGGERS

    // News
    if (q === 'news') {
        fetchNews();
        return;
    }

    // Advice
    if (q === 'advice' || q === 'advise' || q === 'suggest') {
        document.getElementById('advice-panel').classList.add('active');
        fetchAdvice();
        return;
    }

    // Timer (Must check before 'time')
    if (q.startsWith('timer')) {
        document.getElementById('timer-panel').classList.add('active');
        const parts = q.split(' ');
        if(parts[1]) {
            document.getElementById('timer-min').value = parts[1];
            addToChat(`Timer set to ${parts[1]} mins.`, 'bot');
            typeRing("Timer");
        }
        return;
    }

    // Toss
    if (q === 'toss' || q === 'flip' || q === 'coin') {
        document.getElementById('toss-panel').classList.add('active');
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        document.getElementById('coin-result').innerText = result;
        document.getElementById('coin-icon').innerText = result === "Heads" ? "🅰️" : "🅱️";
        typeRing(result);
        addToChat(`Coin: ${result}.`, 'bot');
        resetState();
        return;
    }

    // Dice
    if (q === 'dice' || q === 'roll') {
        document.getElementById('dice-panel').classList.add('active');
        const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
        const roll = Math.floor(Math.random() * 6);
        document.getElementById('dice-face').innerText = faces[roll];
        typeRing(`Rolled ${roll+1}`);
        addToChat(`Rolled a ${roll+1}.`, 'bot');
        resetState();
        return;
    }

    // Weather
    if (q.includes('weather')) {
        const city = q.replace('weather', '').trim();
        if (!city) {
            // No city provided -> Activate State
            addToChat("Which city are you interested in?", 'bot');
            typeRing("City?");
            conversationState = "WAITING_CITY";
        } else {
            // Have city -> Fetch immediately
            getWeather(city);
        }
        return;
    }

    // Countries
    if (q.includes('countries') || q.includes('country')) {
        const name = q.replace('countries', '').replace('country', '').trim();
        if(name) searchCountries(name);
        else {
            document.getElementById('countries-panel').classList.add('active');
            addToChat("Ask: Countries [Name]", 'bot');
        }
        return;
    }

    // System
    if (q === 'system' || q === 'info') {
        document.getElementById('system-panel').classList.add('active');
        const sysContent = document.getElementById('sys-content');
        sysContent.innerHTML = `
            <div class="sys-item"><div class="sys-label">Browser</div><div class="sys-val">${navigator.userAgent.split(')')[0]})</div></div>
            <div class="sys-item"><div class="sys-label">Platform</div><div class="sys-val">${navigator.platform}</div></div>
            <div class="sys-item"><div class="sys-label">Screen</div><div class="sys-val">${window.screen.width}x${window.screen.height}</div></div>
            <div class="sys-item"><div class="sys-label">Cores</div><div class="sys-val">${navigator.hardwareConcurrency || 'Unknown'}</div></div>
        `;
        addToChat("System Stats.", 'bot');
        resetState();
        return;
    }

    // MATH (Input)
    const isMath = /^[\d\%\+\-\*\/\(\)\.\s]+$/.test(q);
    if (isMath || q.includes('%')) {
        document.getElementById('math-panel').classList.add('active');
        try {
            let mathStr = q;
            if (mathStr.includes('%')) {
                mathStr = mathStr.replace(/(\d+)% of (\d+)/, '($1/100)*$2');
                mathStr = mathStr.replace(/(\d+)%/, '($1/100)');
            }
            const result = new Function('return ' + mathStr)();
            const reply = constructDynamicReply('math', result);
            addToChat(reply, 'bot');
            document.getElementById('math-output').innerHTML = `
                <div class="math-line">Input: ${query}</div>
                <div class="math-result">= ${result}</div>
            `;
            typeRing(result.toString());
            resetState();
        } catch (e) {
            addToChat("Invalid format.", 'bot');
            resetState();
        }
        return;
    }

    // 5. CONTEXT & SENTIMENT

    // A. Handling Follow-up (Context Memory)
    // If user asks "Is it raining?" right after Weather
    if (q.includes('is it') && lastIntent === 'weather') {
        const replies = [
            `Yes, I checked ${lastData.city} recently.`,
            `That was live data from sensor.`,
            `I can re-check ${lastData.city} if you like.`,
            `Forecast says there might be rain.`
        ];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        addToChat(reply, 'bot');
        typeRing("Checking...");
        return;
    }

    // B. Sentiment Reaction
    const mood = analyzeSentiment(q);
    if (mood === "POSITIVE") {
        typeRing("😊");
        addToChat("I'm glad I could help!", 'bot');
        resetState();
        return;
    } else if (mood === "NEGATIVE") {
        typeRing("😔");
        addToChat("I'm sorry. I will try to do better.", 'bot');
        resetState();
        return;
    }

    // 6. PARSING & COMMANDS

    // Clock
    const isQuestion = q.includes('what is') || q.includes('tell me') || q.includes('show me') || q.includes('what\'s');

    if (isQuestion && q.includes('time')) {
        const now = new Date();
        typeRing("It is " + now.toLocaleTimeString());
        addToChat("It is " + now.toLocaleTimeString(), 'bot');
        resetState();
        return;
    }
    if (q.includes('time') || q === 'clock') {
        document.getElementById('clock-panel').classList.add('active');
        startClock();
        addToChat("Clock started.", 'bot');
        resetState();
        return;
    }

    // 7. FALLBACKS (Greeting & Wiki)

    // IMPORTANT: We only reach here if NO Custom Match, NO State match, NO Math, and NO Feature match.
    document.getElementById('info-panel').classList.add('active');
    addToChat("Searching archives...", 'bot');

    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
        const res = await fetch(searchUrl);
        const data = await res.json();
        const results = data.query.search;

        if (results.length === 0) {
            addToChat("No data found.", 'bot');
            typeRing("Unknown.");
            resetState();
            return;
        }

        const pageId = results[0].pageid;
        const title = results[0].title;

        const infoUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&prop=extracts&pageids=${pageId}&exintro=true&explaintext=true&format=json`;
        const infoRes = await fetch(infoUrl);
        const infoData = await infoRes.json();
        const extract = infoData.query.pages[pageId].extract;

        const reply = constructDynamicReply('wiki', title);
        addToChat(reply, 'bot');

        const infoContent = document.getElementById('info-content');
        infoContent.innerHTML = `<div class="wiki-title">${title}</div><div class="wiki-extract">${extract.substring(0, 500)}...</div>`;
        addToChat(`Found: ${title}`, 'bot');

        const imgUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&pageids=${pageId}&prop=pageimages|images&pithumbsize=400&format=json`;
        const imgRes = await fetch(imgUrl);
        const imgData = await imgRes.json();
        const page = imgData.query.pages[pageId];

        if (page.thumbnail) createImagePanel(page.thumbnail.source, 'Photo 1', 160, -50);

        resetState();

    } catch (e) {
        console.error(e);
        addToChat("Connection failed.", 'bot');
        resetState();
    }
}

// Input Listener
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const val = input.value;
        if(!val) return;
        input.value = '';
        processQuery(val);
    }
});

// Init
addToChat("System Online.", 'bot');

// --- LOCAL STORAGE UTILITIES (Keeping these as they are useful for caching News, even if we focus on the file for the main brain) ---
function getCachedData(key) {
    try {
        const item = localStorage.getItem('riri_cache_' + key);
        if (!item) return null;
        
        const parsed = JSON.parse(item);
        // Check expiry (24 hours)
        if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('riri_cache_' + key);
            return null;
        }
        return parsed.data;
    } catch (e) {
        return null;
    }
}

function setCachedData(key, data) {
    const payload = {
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem('riri_cache_' + key, JSON.stringify(payload));
}

function clearAllCache() {
    // Removes all items starting with 'riri_cache_'
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('riri_cache_')) {
            localStorage.removeItem(key);
        }
    });
}
