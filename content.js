// content.js

let audioContext;
let mediaElementSource;
let analyserNode;
let gainNodeOriginalMix; // To control the original mix volume
let currentSoloFilter = null; // Stores the currently soloed filter's ID
const frequencyBandFilters = []; // Array to hold filter objects
let isDissectModeActive = false;
let youtubeVideoElement = null;
let panelUI = null;
let animationFrameId;
let loopInterval; // Move to global scope

// --- UI Elements ---
let canvas;
let canvasCtx;
let loopStartSlider, loopEndSlider, loopResetBtn;
let detectedBPMDisplay, detectedKeyDisplay; // For future implementation

// Define frequency bands (adjust these values for optimal separation feel)
const BANDS = [
    { id: 'low', type: 'lowpass', frequency: 200, Q: 1.0, label: 'Lows (<200Hz)' },
    { id: 'low-mid', type: 'bandpass', frequency: 500, Q: 1.5, label: 'Low Mids (200-800Hz)' },
    { id: 'mid', type: 'bandpass', frequency: 1500, Q: 1.5, label: 'Mids (800Hz-3kHz)' },
    { id: 'high-mid', type: 'bandpass', frequency: 5000, Q: 1.5, label: 'High Mids (3kHz-8kHz)' },
    { id: 'high', type: 'highpass', frequency: 8000, Q: 1.0, label: 'Highs (>8kHz)' }
];

// --- Web Audio API Initialization ---
function initAudioContext() {
    if (audioContext && audioContext.state === 'running') {
        return true; // Already initialized
    }
    youtubeVideoElement = document.querySelector('video.html5-main-video');
    if (!youtubeVideoElement) {
        console.warn("YouTube video element not found.");
        return false;
    }

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    } catch (e) {
        console.error("Web Audio API not supported or failed to initialize:", e);
        return false;
    }

    // Connect source to master gain for original mix
    mediaElementSource = audioContext.createMediaElementSource(youtubeVideoElement);
    gainNodeOriginalMix = audioContext.createGain();
    mediaElementSource.connect(gainNodeOriginalMix);
    gainNodeOriginalMix.connect(audioContext.destination);
    gainNodeOriginalMix.gain.value = 1; // Start with full volume for original mix

    // Analyser Node for visualization
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048; // Good balance for freq data

    // Connect original source to analyser for full spectrum analysis
    mediaElementSource.connect(analyserNode);

    // Create and connect frequency band filters
    frequencyBandFilters.forEach(band => {
        // Disconnect previous if re-initializing
        if (band.filter && band.filter.numberOfInputs > 0) {
            band.filter.disconnect();
            band.gain.disconnect();
        }

        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();

        filter.type = band.type;
        filter.frequency.value = band.frequency;
        filter.Q.value = band.Q;

        // Connect source -> filter -> gain -> destination
        mediaElementSource.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);

        gain.gain.value = 0; // Mute all filters by default

        // Store references
        band.filter = filter;
        band.gain = gain;
    });

    console.log("Web Audio API initialized.");
    return true;
}

// --- Audio Control Functions ---
function soloFrequencyBand(bandId) {
    if (!audioContext || !mediaElementSource) {
        console.warn("Audio context not initialized.");
        return;
    }

    // Mute original mix
    gainNodeOriginalMix.gain.value = 0;

    frequencyBandFilters.forEach(band => {
        if (band.id === bandId) {
            band.gain.gain.value = 1; // Solo this band
            currentSoloFilter = bandId;
        } else {
            band.gain.gain.value = 0; // Mute other bands
        }
    });
    console.log(`Soloing band: ${bandId}`);
}

function unSoloAllBands() {
    if (!audioContext || !mediaElementSource) return;

    frequencyBandFilters.forEach(band => {
        band.gain.gain.value = 0; // Mute all individual band filters
    });
    gainNodeOriginalMix.gain.value = 1; // Restore original mix volume
    currentSoloFilter = null;
    console.log("Unsoloing all bands. Original mix restored.");
}

// --- UI Rendering ---
function createPanelUI() {
    if (panelUI) return; // Panel already exists

    panelUI = document.createElement('div');
    panelUI.id = 'dissect-a-song-panel';
    panelUI.className = 'hidden'; // Start hidden

    panelUI.innerHTML = `
        <button id="close-btn">&times;</button>
        <h3>Dissect-A-Song</h3>

        <div class="section-title">Visuals</div>
        <canvas id="dissect-canvas"></canvas>

        <div class="section-title">Insights</div>
        <div class="info-display">
            <div class="info-item">BPM: <strong id="detected-bpm">--</strong></div>
            <div class="info-item">Key: <strong id="detected-key">--</strong></div>
        </div>

        <div class="section-title">Isolation</div>
        <div id="filter-controls">
            ${BANDS.map(band => `
                <div class="slider-row">
                    <label>${band.label}</label>
                    <button class="solo-btn" data-band-id="${band.id}">Solo</button>
                </div>
            `).join('')}
             <button id="unsolo-all-btn" class="solo-btn">Unsolo All</button>
        </div>

        <div class="section-title">Looping</div>
        <div class="loop-controls">
            <span class="loop-time" id="loop-start-time">0:00</span>
            <input type="range" id="loop-start-slider" min="0" value="0">
            <input type="range" id="loop-end-slider" min="0" value="0">
            <span class="loop-time" id="loop-end-time">0:00</span>
        </div>
        <button id="loop-toggle-btn">Set Loop & Play</button>
        <button id="loop-reset-btn">Reset Loop</button>
    `;

    document.body.appendChild(panelUI);

    // Cache UI elements
    canvas = document.getElementById('dissect-canvas');
    canvasCtx = canvas.getContext('2d');
    loopStartSlider = document.getElementById('loop-start-slider');
    loopEndSlider = document.getElementById('loop-end-slider');
    loopResetBtn = document.getElementById('loop-reset-btn');
    detectedBPMDisplay = document.getElementById('detected-bpm');
    detectedKeyDisplay = document.getElementById('detected-key'); // Placeholder for future

    // Add event listeners
    document.getElementById('close-btn').addEventListener('click', () => toggleDissectMode(false));

    panelUI.querySelectorAll('.solo-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const bandId = e.target.dataset.bandId;
            if (bandId) {
                // If the same band is already soloed, unsolo it
                if (currentSoloFilter === bandId) {
                     unSoloAllBands();
                     e.target.classList.remove('active');
                } else {
                    soloFrequencyBand(bandId);
                    // Update active class
                    panelUI.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                }
            } else if (e.target.id === 'unsolo-all-btn') {
                unSoloAllBands();
                panelUI.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
            }
        });
    });

    // Loop functionality event listeners
    const loopToggleBtn = document.getElementById('loop-toggle-btn');

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    const updateLoopTimes = () => {
        document.getElementById('loop-start-time').textContent = formatTime(loopStartSlider.value);
        document.getElementById('loop-end-time').textContent = formatTime(loopEndSlider.value);
    };

    if (youtubeVideoElement) {
        loopStartSlider.max = youtubeVideoElement.duration || 0;
        loopEndSlider.max = youtubeVideoElement.duration || 0;
        loopEndSlider.value = youtubeVideoElement.duration || 0; // End at full duration initially
    }
    updateLoopTimes(); // Initial update

    loopStartSlider.addEventListener('input', updateLoopTimes);
    loopEndSlider.addEventListener('input', updateLoopTimes);

    loopToggleBtn.addEventListener('click', () => {
        if (!youtubeVideoElement) {
            console.warn("YouTube video element not available for looping.");
            return;
        }

        const startTime = parseFloat(loopStartSlider.value);
        const endTime = parseFloat(loopEndSlider.value);

        if (endTime <= startTime) {
            alert("End time must be greater than start time for looping.");
            return;
        }

        // Stop any existing loop
        clearInterval(loopInterval);
        loopInterval = null;

        // Start the loop
        youtubeVideoElement.currentTime = startTime;
        if (youtubeVideoElement.paused) {
            youtubeVideoElement.play();
        }

        loopInterval = setInterval(() => {
            if (youtubeVideoElement.currentTime >= endTime) {
                youtubeVideoElement.currentTime = startTime; // Loop back
            }
        }, 100); // Check every 100ms

        loopToggleBtn.textContent = "Looping... Click to Stop";
        loopToggleBtn.style.backgroundColor = "#007bff"; // Blue for active loop
    });

    loopResetBtn.addEventListener('click', () => {
        clearInterval(loopInterval);
        loopInterval = null;
        loopToggleBtn.textContent = "Set Loop & Play";
        loopToggleBtn.style.backgroundColor = "#FF0000";
        if (youtubeVideoElement) {
             youtubeVideoElement.currentTime = 0; // Reset video to start
             if (!youtubeVideoElement.paused) youtubeVideoElement.pause(); // Pause if playing
             loopStartSlider.value = 0;
             loopEndSlider.value = youtubeVideoElement.duration || 0;
             updateLoopTimes();
        }
    });

    // Update loop slider max when video duration is known
    youtubeVideoElement.addEventListener('loadedmetadata', () => {
        loopStartSlider.max = youtubeVideoElement.duration;
        loopEndSlider.max = youtubeVideoElement.duration;
        loopEndSlider.value = youtubeVideoElement.duration; // Default to full length
        updateLoopTimes();
    });

    // Handle video ending outside loop to stop loop
    youtubeVideoElement.addEventListener('ended', () => {
        if (loopInterval) {
            clearInterval(loopInterval);
            loopInterval = null;
            loopToggleBtn.textContent = "Set Loop & Play";
            loopToggleBtn.style.backgroundColor = "#FF0000";
        }
    });
}

// --- Visualizations ---
function drawVisualizations() {
    if (!analyserNode || !canvas || !canvasCtx || !isDissectModeActive) {
        cancelAnimationFrame(animationFrameId);
        return;
    }

    const bufferLength = analyserNode.frequencyBinCount; // Half of fftSize
    const dataArray = new Uint8Array(bufferLength); // Data for frequency visualization

    // --- Spectrogram-like Visualization ---
    analyserNode.getByteFrequencyData(dataArray); // Get frequency data

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.fillStyle = '#1a1a1a'; // Background
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5; // Adjust for spacing
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 255 * canvas.height; // Normalize to canvas height

        // Simple color gradient based on height
        const hue = i / bufferLength * 360; // Map frequency to hue
        canvasCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1; // Add a small gap between bars
    }

    animationFrameId = requestAnimationFrame(drawVisualizations);
}

// --- Main Toggle Function ---
function toggleDissectMode(activate) {
    if (activate === undefined) { // If called without argument, toggle state
        isDissectModeActive = !isDissectModeActive;
    } else {
        isDissectModeActive = activate;
    }

    if (!panelUI) {
        createPanelUI(); // Create UI if it doesn't exist
    }

    if (isDissectModeActive) {
        const initialized = initAudioContext();
        if (initialized) {
            panelUI.classList.remove('hidden');
            drawVisualizations(); // Start drawing
            // Ensure solo buttons reflect current state
            panelUI.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
            if (currentSoloFilter) {
                panelUI.querySelector(`[data-band-id="${currentSoloFilter}"]`).classList.add('active');
            }
        } else {
            console.error("Failed to activate Dissect Mode: Audio context not initialized.");
            isDissectModeActive = false; // Revert state
        }
    } else {
        panelUI.classList.add('hidden');
        cancelAnimationFrame(animationFrameId); // Stop drawing
        // Ensure all audio nodes are muted/disconnected properly
        if (audioContext) {
            unSoloAllBands(); // Restore original mix
            // Consider disconnecting all nodes and setting to null to free resources
            // For simplicity in this example, we'll leave context alive but restore original mix.
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
            if(document.getElementById('loop-toggle-btn')) {
                document.getElementById('loop-toggle-btn').textContent = "Set Loop & Play";
                document.getElementById('loop-toggle-btn').style.backgroundColor = "#FF0000";
            }
        }
    }

    // Inform the popup/background script about the current status
    return { status: isDissectModeActive ? "active" : "inactive" };
}

// --- Message Listener from background script or popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleUI") {
        const response = toggleDissectMode();
        sendResponse(response);
        return true; // Indicate that sendResponse will be called asynchronously
    } else if (request.action === "getStatus") {
        sendResponse({ status: isDissectModeActive ? "active" : "inactive" });
        return true;
    }
});

// Initialize frequency band filters
BANDS.forEach(band => frequencyBandFilters.push({ ...band }));