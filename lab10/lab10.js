
const byId = id => document.getElementById(id);
const slider = byId("time-slider");
const actionStatus = byId("action-status");
const voiceButton = byId("voice-button");
const voiceStatus = byId("voice-status");
const cameraButton = byId("camera-button");
const gestureStatus = byId("gesture-status");
const video = byId("camera");
const overlay = byId("hand-overlay");
const context = overlay.getContext("2d");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const cameraSupported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
let ready = false;
let playing = false;
let actionSource = "Controls";

function feedback(message) {
    if (gestureStatus.textContent !== message) gestureStatus.textContent = message;
}

function invokeButton(command, source) {
    if (!ready) return;
    actionSource = source;
    byId(command).click();
    actionSource = "Controls";
}

function selectDay(day, source) {
    if (!ready) return;
    slider.value = Math.max(+slider.min, Math.min(+slider.max, Math.round(day)));
    actionSource = source;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    actionSource = "Controls";
}

for (const command of ["play", "pause", "reset"]) {
    byId(command).addEventListener("click", () => {
        if (!ready) return;
        playing = command === "play";
        resetHandBaseline();
        const text = command === "play" ? "Playing" : command === "pause" ? "Paused" : "Reset to day 1; paused";
        actionStatus.textContent = `${actionSource}: ${text}.`;
    });
}
slider.addEventListener("input", () => {
    playing = false;
    if (actionSource !== "Hand") resetHandBaseline();
    actionStatus.textContent = `${actionSource}: Selected day ${slider.value}; paused.`;
});
byId("timeline").addEventListener("click", event => {
    if (ready && event.target.classList.contains("timeline-overlay")) {
        playing = false;
        resetHandBaseline();
        actionStatus.textContent = `Timeline: Selected day ${slider.value}; paused.`;
    }
});


const dayObserver = new MutationObserver(checkVisualization);
dayObserver.observe(byId("current-time"), { childList: true, subtree: true });
const errorObserver = new MutationObserver(() => {
    if (!ready && byId("network").querySelector(".error")) {
        actionStatus.textContent = "Data unavailable. Serve the repository through localhost and reload.";
    }
});
errorObserver.observe(byId("network"), { childList: true });

function checkVisualization() {
    if (!ready && byId("current-time").textContent.includes(" - ")) {
        ready = true;
        for (const id of ["play", "pause", "reset", "time-slider"]) byId(id).disabled = false;
        voiceButton.disabled = !SpeechRecognition || !window.isSecureContext;
        cameraButton.disabled = !cameraSupported;
        actionStatus.textContent = "Ready. Day 1 selected; paused. Sensors are off.";
        errorObserver.disconnect();
    }
    if (playing && +slider.value === +slider.max) {
        playing = false;
        actionStatus.textContent = "Playback reached day 60; paused.";
    }
}
if (!SpeechRecognition) voiceStatus.textContent = "Speech recognition unavailable. Use the playback buttons.";
else if (!window.isSecureContext) voiceStatus.textContent = "Voice requires localhost or HTTPS. Use the playback buttons.";
if (!cameraSupported) feedback("Camera unavailable. Use localhost or HTTPS, or the day slider.");
checkVisualization();

let recognition = null;
let voiceEnabled = false;
let restartTimeout = null;
function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    voiceButton.setAttribute("aria-pressed", String(enabled));
    voiceButton.textContent = enabled ? "Stop Voice Control" : "Start Voice Control";
    clearTimeout(restartTimeout);
}
function stopVoice(message = "Voice control inactive.") {
    setVoiceEnabled(false);
    recognition?.abort();
    voiceStatus.textContent = message;
}
function startListening() {
    if (!voiceEnabled) return;
    try {
        recognition.start();
        voiceStatus.textContent = "Starting microphone…";
    } catch (error) {
        stopVoice(`Could not start voice control (${error.name}). Use the buttons or try again.`);
    }
}
function createRecognition() {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onstart = () => {
        if (!voiceEnabled) { recognition.abort(); return; }
        voiceStatus.textContent = "Listening. Say Play, Pause, or Reset.";
    };
    recognition.onresult = event => {
        if (!voiceEnabled) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) continue;
            const transcript = event.results[i][0].transcript.trim();
            byId("voice-heard").textContent = `Heard: “${transcript}”`;
            // Match whole commands, avoiding accidental substring triggers such as "display".
            const command = transcript.toLowerCase().replace(/[.!?,;:]/g, "").trim();
            if (["play", "pause", "reset"].includes(command)) {
                invokeButton(command, "Voice");
                voiceStatus.textContent = `Recognized ${command}. Still listening.`;
            } else {
                voiceStatus.textContent = "Command not recognized. Say only Play, Pause, or Reset.";
            }
        }
    };
    recognition.onnomatch = () => {
        if (voiceEnabled) voiceStatus.textContent = "No command recognized. Say Play, Pause, or Reset.";
    };
    recognition.onerror = event => {
        if (!voiceEnabled) return;
        if (event.error === "no-speech") {
            voiceStatus.textContent = "No speech detected. Listening will resume.";
            return;
        }
        const reasons = {
            "not-allowed": "Microphone permission denied",
            "service-not-allowed": "Speech service unavailable",
            "audio-capture": "No microphone available",
            network: "Speech service network error",
            aborted: "Speech recognition interrupted"
        };
        stopVoice(`${reasons[event.error] || `Voice error: ${event.error}`}. Use the buttons or try again.`);
    };
    recognition.onend = () => {
        if (voiceEnabled) restartTimeout = setTimeout(startListening, 400);
    };
}
voiceButton.addEventListener("click", () => {
    if (voiceEnabled) { stopVoice(); return; }
    if (!ready || !SpeechRecognition) return;
    try {
        if (!recognition) createRecognition();
        setVoiceEnabled(true);
        startListening();
    } catch (error) {
        stopVoice(`Voice unavailable (${error.name}). Use the playback buttons.`);
    }
});


const MEDIAPIPE_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let handLandmarker = null;
let cameraEnabled = false;
let cameraGeneration = 0;
let stream = null;
let frameRequest = null;
let lastVideoTime = -1;
let lastInferenceTime = 0;
let smoothX = null;
let appliedX = null;
let previousX = null;
let stableFrames = 0;
let lastMoveTime = 0;
function resetHandBaseline() {
    smoothX = appliedX = previousX = null;
    stableFrames = 0;
    lastMoveTime = 0;
}
function stopCamera(message = "Camera inactive.") {
    cameraEnabled = false;
    cameraGeneration++;
    cancelAnimationFrame(frameRequest);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    context.clearRect(0, 0, overlay.width, overlay.height);
    byId("camera-placeholder").hidden = false;
    cameraButton.textContent = "Start Camera";
    cameraButton.setAttribute("aria-pressed", "false");
    resetHandBaseline();
    feedback(message);
}

async function startCamera() {
    if (!ready || !cameraSupported) return;
    cameraEnabled = true;
    const generation = ++cameraGeneration;
    cameraButton.textContent = "Stop Camera";
    cameraButton.setAttribute("aria-pressed", "true");
    feedback("Requesting camera permission…");
    try {
        // Await permission before downloading the model. Stopping during the
        // permission dialog also stops any stream that resolves afterward.
        const requestedStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false
        });
        if (!cameraEnabled || generation !== cameraGeneration) {
            requestedStream.getTracks().forEach(track => track.stop());
            return;
        }
        stream = requestedStream;
        for (const track of stream.getVideoTracks()) {
            track.addEventListener("ended", () => {
                if (generation === cameraGeneration) stopCamera("Camera disconnected. Use the slider or restart the camera.");
            });
        }
        video.srcObject = stream;
        await video.play();
        if (!cameraEnabled || generation !== cameraGeneration) return;
        byId("camera-placeholder").hidden = true;
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        if (!handLandmarker) {
            feedback("Loading hand tracking model… You can still use the slider.");
            const { FilesetResolver, HandLandmarker } = await import(`${MEDIAPIPE_ROOT}/vision_bundle.mjs`);
            if (!cameraEnabled || generation !== cameraGeneration) return;
            const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_ROOT}/wasm`);
            if (!cameraEnabled || generation !== cameraGeneration) return;
            const detector = await HandLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
                runningMode: "VIDEO",
                numHands: 1,
                minHandDetectionConfidence: 0.65,
                minHandPresenceConfidence: 0.65,
                minTrackingConfidence: 0.65
            });
            if (!cameraEnabled || generation !== cameraGeneration) { detector.close(); return; }
            handLandmarker = detector;
        }
        if (!cameraEnabled || generation !== cameraGeneration) return;
        resetHandBaseline();
        lastVideoTime = -1;
        lastInferenceTime = 0;
        feedback("Camera active. Show one hand, then move left or right.");
        frameRequest = requestAnimationFrame(trackHand);
    } catch (error) {
        if (!cameraEnabled || generation !== cameraGeneration) return;
        const reasons = {
            NotAllowedError: "Camera permission denied",
            NotFoundError: "No camera found",
            NotReadableError: "Camera is busy or unavailable"
        };
        stopCamera(`${reasons[error.name] || "Camera or hand model could not start; check your connection"}. Use the day slider or try again.`);
        console.warn("Hand tracking could not start:", error);
    }
}
cameraButton.addEventListener("click", () => {
    if (cameraEnabled) stopCamera();
    else startCamera();
});

const handConnections = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
    [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];
function drawHand(landmarks) {
    context.clearRect(0, 0, overlay.width, overlay.height);
    if (!landmarks) return;
    context.strokeStyle = "#34d399";
    context.lineWidth = 3;
    for (const [a, b] of handConnections) {
        context.beginPath();
        context.moveTo(landmarks[a].x * overlay.width, landmarks[a].y * overlay.height);
        context.lineTo(landmarks[b].x * overlay.width, landmarks[b].y * overlay.height);
        context.stroke();
    }
    context.fillStyle = "#fef08a";
    for (const point of landmarks) {
        context.beginPath();
        context.arc(point.x * overlay.width, point.y * overlay.height, 4, 0, 2 * Math.PI);
        context.fill();
    }
}
function scrubWithHand(landmarks, timestamp) {
    if (!landmarks) {
        resetHandBaseline();
        feedback("No hand detected. Show one hand in the preview.");
        return;
    }
    // Palm center is more stable than a fingertip. Invert x to match the mirror.
    const x = 1 - [0, 5, 9, 13, 17].reduce((sum, i) => sum + landmarks[i].x, 0) / 5;
    if (previousX !== null && Math.abs(x - previousX) > 0.25) resetHandBaseline();
    previousX = x;
    smoothX = smoothX === null ? x : smoothX + 0.35 * (x - smoothX);
    if (stableFrames++ < 3) {
        appliedX = smoothX;
        feedback("Hand detected. Hold briefly, then move left or right.");
        return;
    }
    const delta = smoothX - appliedX;
    if (Math.abs(delta) < 0.014 || timestamp - lastMoveTime < 140) {
        // Preserve the latest movement feedback during a brief hold.
        if (!lastMoveTime || timestamp - lastMoveTime > 800) feedback("Hand detected. Move left or right to scrub days.");
        return;
    }
    const daysPerWidth = (+slider.max - +slider.min) / 0.65;
    const steps = Math.round(delta * daysPerWidth);
    const oldDay = +slider.value;
    const day = Math.max(+slider.min, Math.min(+slider.max, oldDay + steps));
    lastMoveTime = timestamp;
    // Consume movement at the boundary so reversing direction responds promptly.
    appliedX = day === +slider.min || day === +slider.max ? smoothX : appliedX + steps / daysPerWidth;
    selectDay(day, "Hand");
    feedback(`Detected: Drag ${delta > 0 ? "Right" : "Left"} → day ${day}${day === oldDay ? " (limit reached)" : ""}; paused.`);
}
function trackHand(timestamp) {
    if (!cameraEnabled) return;
    try {
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime && timestamp - lastInferenceTime >= 80) {
            lastVideoTime = video.currentTime;
            lastInferenceTime = timestamp;
            const result = handLandmarker.detectForVideo(video, timestamp);
            const landmarks = result.landmarks[0];
            drawHand(landmarks);
            scrubWithHand(landmarks, timestamp);
        }
        frameRequest = requestAnimationFrame(trackHand);
    } catch (error) {
        stopCamera("Hand tracking stopped after an error. Use the slider or restart the camera.");
        console.warn("Hand tracking failed:", error);
    }
}


function stopSensors() {
    if (voiceEnabled) stopVoice("Voice stopped because the page is inactive. Click Start to resume.");
    if (cameraEnabled) stopCamera("Camera stopped because the page is inactive. Click Start to resume.");
}
document.addEventListener("visibilitychange", () => { if (document.hidden) stopSensors(); });
window.addEventListener("pagehide", () => {
    stopSensors();
    handLandmarker?.close();
    handLandmarker = null;
});
