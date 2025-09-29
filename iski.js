// =================================================================================
// FACE & MOOD DETECTION LOGIC
// =================================================================================
class FaceMoodDetection {
  constructor() {
    this.video = document.getElementById("video");
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.placeholderText = document.getElementById('placeholder-text');
    this.cameraBtn = document.getElementById("camera-btn");

    this.isModelLoaded = false;
    this.isCameraOn = false;
    this.stream = null;
    this.detectionInterval = null;
    this.faceDetected = false;

    // Track last emitted emotion to avoid noisy duplicates
    this.lastEmotion = null;

    this.emotionConfig = {
      happy: { emoji: "😊" },
      sad: { emoji: "😢" },
      angry: { emoji: "😠" },
      surprised: { emoji: "😲" },
      neutral: { emoji: "😐" },
      fearful: { emoji: "😨" },
      disgusted: { emoji: "🤢" },
    };

    this.init();
  }

  async init() {
    await this.loadModels();
    this.setupEventListeners();
  }

  async loadModels() {
    try {
      const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      this.isModelLoaded = true;
      this.placeholderText.textContent = 'Camera is off';
      this.cameraBtn.disabled = false;
    } catch (error) {
      console.error("Error loading models:", error);
      this.placeholderText.textContent = 'AI Models Failed to Load';
    }
  }

  setupEventListeners() {
    this.cameraBtn.addEventListener("click", () => {
      this.isCameraOn ? this.stopCamera() : this.startCamera();
    });

    this.video.addEventListener("loadedmetadata", () => {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      this.detectionInterval = setInterval(() => this.detectEmotion(), 200);
    });
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video.srcObject = this.stream;
      this.isCameraOn = true;
      this.updateCameraUI();
    } catch (error) {
      console.error("Error accessing camera:", error);
      this.placeholderText.textContent = 'Camera permission denied';
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    clearInterval(this.detectionInterval);
    this.isCameraOn = false;
    this.faceDetected = false;
    this.updateCurrentEmotion(null);
    this.updateCameraUI();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  updateCameraUI() {
    this.cameraBtn.textContent = this.isCameraOn ? "Stop Camera" : "Start Camera";
    this.cameraBtn.classList.toggle('stop', this.isCameraOn);
    document.getElementById('camera-placeholder').style.display = this.isCameraOn ? 'none' : 'flex';
  }

  async detectEmotion() {
    if (!this.isCameraOn || !this.isModelLoaded || this.video.readyState !== 4) return;

    const detection = await faceapi
      .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceExpressions();

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (detection) {
      this.faceDetected = true;
      const expressions = detection.expressions;
      const [maxExpression] = Object.entries(expressions).sort(([, a], [, b]) => b - a)[0];
      this.updateCurrentEmotion({ emotion: maxExpression });
    } else {
      this.faceDetected = false;
      setTimeout(() => { if (!this.faceDetected) this.updateCurrentEmotion(null); }, 1000);
    }
  }

  updateCurrentEmotion(emotionData) {
    const moodEl = document.getElementById('detected-mood');
    if (!moodEl) return;

    if (emotionData) {
      const config = this.emotionConfig[emotionData.emotion];
      const capitalized = emotionData.emotion.charAt(0).toUpperCase() + emotionData.emotion.slice(1);
      moodEl.innerHTML = `${capitalized} ${config.emoji}`;

      // Emit emotion change event when value changes
      if (this.lastEmotion !== emotionData.emotion) {
        this.lastEmotion = emotionData.emotion;
        // Expose current emotion globally for simple gating logic
        window.currentEmotion = emotionData.emotion;
        window.dispatchEvent(new CustomEvent('emotionchange', { detail: { emotion: emotionData.emotion, at: Date.now() } }));
      }
    } else {
      moodEl.textContent = this.isCameraOn ? "Analyzing..." : "Inactive";
      if (this.lastEmotion !== null) {
        this.lastEmotion = null;
        window.currentEmotion = null;
        window.dispatchEvent(new CustomEvent('emotionchange', { detail: { emotion: null, at: Date.now() } }));
      }
    }
  }
}

// =================================================================================
// BLUETOOTH HEART RATE MONITORING
// =================================================================================
class BluetoothHeartRateMonitor {
  constructor() {
    this.device = null;
    this.server = null;
    this.heartRateService = null;
    this.heartRateCharacteristic = null;
    this.isConnected = false;
    this.heartRateData = [];
    this.stressThreshold = 100; // BPM threshold for stress detection
    this.avgWindow = 10; // Number of readings to average
    
    this.connectBtn = document.getElementById('bluetooth-connect');
    this.heartRateEl = document.getElementById('heart-rate');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.connectBtn) {
      this.connectBtn.addEventListener('click', () => {
        this.isConnected ? this.disconnect() : this.connect();
      });
    }
  }

  async connect() {
    if (!navigator.bluetooth) {
      alert('Bluetooth is not supported by this browser');
      return;
    }

    try {
      this.connectBtn.textContent = '🔗';
      this.connectBtn.classList.add('connecting');
      
      // Request device with heart rate service
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['heart_rate'] },
          { namePrefix: 'Polar' },
          { namePrefix: 'Garmin' },
          { namePrefix: 'Fitbit' },
          { namePrefix: 'Apple Watch' }
        ],
        optionalServices: ['heart_rate']
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.onDisconnected();
      });

      // Connect to GATT server
      this.server = await this.device.gatt.connect();
      
      // Get heart rate service
      this.heartRateService = await this.server.getPrimaryService('heart_rate');
      
      // Get heart rate measurement characteristic
      this.heartRateCharacteristic = await this.heartRateService.getCharacteristic('heart_rate_measurement');
      
      // Start notifications
      await this.heartRateCharacteristic.startNotifications();
      this.heartRateCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        this.onHeartRateChanged(event);
      });

      this.isConnected = true;
      this.connectBtn.textContent = '📱';
      this.connectBtn.classList.remove('connecting');
      this.connectBtn.classList.add('connected');
      
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      this.connectBtn.textContent = '📱';
      this.connectBtn.classList.remove('connecting');
      alert('Failed to connect to heart rate device: ' + error.message);
    }
  }

  onHeartRateChanged(event) {
    const value = event.target.value;
    const heartRate = this.parseHeartRate(value);
    
    if (heartRate > 0) {
      this.updateHeartRate(heartRate);
      this.checkForStress(heartRate);
    }
  }

  parseHeartRate(value) {
    // Parse heart rate from characteristic value
    const data = new Uint8Array(value.buffer);
    let heartRate = 0;
    
    if (data.length >= 2) {
      // Check if 16-bit format
      if (data[0] & 0x01) {
        heartRate = data[1] | (data[2] << 8);
      } else {
        heartRate = data[1];
      }
    }
    
    return heartRate;
  }

  updateHeartRate(heartRate) {
    // Update UI
    if (this.heartRateEl) {
      this.heartRateEl.innerHTML = `${heartRate} <span class="unit">BPM</span>`;
      this.heartRateEl.className = `stat-value ${heartRate > this.stressThreshold ? 'text-yellow' : 'text-green'}`;
    }

    // Store in rolling average
    this.heartRateData.push(heartRate);
    if (this.heartRateData.length > this.avgWindow) {
      this.heartRateData.shift();
    }

    // Emit heart rate event with current rolling average
    const average = this.heartRateData.reduce((a, b) => a + b, 0) / this.heartRateData.length;
    window.dispatchEvent(new CustomEvent('heartrate', {
      detail: { value: heartRate, average, at: Date.now() }
    }));
  }

  checkForStress(heartRate) {
    if (this.heartRateData.length < 3) return;
    
    const avgHeartRate = this.heartRateData.reduce((a, b) => a + b, 0) / this.heartRateData.length;
    
    // Trigger stress relief if heart rate is consistently high
    if (avgHeartRate > this.stressThreshold && this.heartRateData.length >= 5) {
      this.triggerStressRelief();
    }
  }

  triggerStressRelief() {
    // Emit stress event for games redirect
    window.dispatchEvent(new CustomEvent('stressdetected', { 
      detail: { 
        type: 'high_heart_rate', 
        value: this.heartRateData[this.heartRateData.length - 1],
        average: this.heartRateData.reduce((a, b) => a + b, 0) / this.heartRateData.length,
        at: Date.now() 
      } 
    }));
  }

  onDisconnected() {
    this.isConnected = false;
    this.device = null;
    this.server = null;
    this.heartRateService = null;
    this.heartRateCharacteristic = null;
    
    if (this.connectBtn) {
      this.connectBtn.textContent = '📱';
      this.connectBtn.classList.remove('connected', 'connecting');
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.onDisconnected();
  }
}

// =================================================================================
// DASHBOARD UI LOGIC
// =================================================================================
function initDashboard() {
    let isListening = false;
    const routine = [
        { time: '06:00', task: 'Wake up & Health Check', duration: '30 min', status: 'completed' },
        { time: '06:30', task: 'Exercise Session', duration: '45 min', status: 'completed' },
        { time: '07:15', task: 'Breakfast & Nutrition', duration: '30 min', status: 'completed' },
        { time: '08:00', task: 'Mission Briefing', duration: '60 min', status: 'current' },
        { time: '11:00', task: 'Lunch Break', duration: '45 min', status: 'upcoming' },
        { time: '12:00', task: 'Scientific Research', duration: '180 min', status: 'upcoming' },
        { time: '15:00', task: 'System Maintenance', duration: '90 min', status: 'upcoming' }
    ];

    // --- ELEMENT SELECTORS ---
    const currentTimeEl = document.getElementById('current-time');
    const currentDateEl = document.getElementById('current-date');
    const lastCheckEl = document.getElementById('last-check');
    const voiceToggleBtn = document.getElementById('voice-toggle-btn');
    const micContainer = document.getElementById('mic-container');
    const aiMessageContainer = document.getElementById('ai-message-container');
    const scheduleContainer = document.getElementById('schedule-container');
    const healthElements = {
        heartRate: document.getElementById('heart-rate'),
        o2Level: document.getElementById('o2-level'),
        bloodPressure: document.getElementById('blood-pressure'),
        radiation: document.getElementById('radiation')
    };

    const updateTime = () => {
        const now = new Date();
        currentTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        currentDateEl.textContent = `Mission Day 127 • ${now.toLocaleDateString()}`;
        lastCheckEl.textContent = `Last Health Check: ${now.toLocaleTimeString()}`;
    };

    const handleVoiceToggle = () => {
        isListening = !isListening;
        micContainer.classList.toggle('listening', isListening);
        
        if (isListening) {
            aiMessageContainer.textContent = "Listening... Speak your command";
            window.MaitriAssistant?.startListening();
        } else {
            aiMessageContainer.textContent = "";
            window.MaitriAssistant?.stopListening();
        }
    };

    const updateHealthData = () => {
        const heartRate = Math.floor(Math.random() * 15) + 65; // 65-80
        const o2Level = parseFloat((Math.random() + 98).toFixed(1)); // 98.0-99.0
        const radiation = parseFloat((Math.random() * 0.05 + 0.10).toFixed(3)); // 0.100-0.150

        healthElements.heartRate.innerHTML = `${heartRate} <span class="unit">BPM</span>`;
        healthElements.o2Level.innerHTML = `${o2Level} <span class="unit">%</span>`;
        healthElements.radiation.innerHTML = `${radiation} <span class="unit">mSv/h</span>`;

        healthElements.heartRate.className = `stat-value ${heartRate > 90 ? 'text-yellow' : 'text-green'}`;
        healthElements.o2Level.className = `stat-value ${o2Level < 97 ? 'text-yellow' : 'text-green'}`;
        healthElements.radiation.className = `stat-value ${radiation > 0.14 ? 'text-yellow' : 'text-green'}`;
    };

    const renderSchedule = () => {
        scheduleContainer.innerHTML = routine.map(item => {
            const isExercise = item.task === 'Exercise Session';
            const exerciseDropdown = isExercise ? `
                <details class="exercise-dropdown">
                    <summary>Exercise List</summary>
                    <div class="exercise-groups">
                        <div class="exercise-group">
                            <div class="exercise-title">Cardiovascular Exercises</div>
                            <ul>
                                <li>Running</li>
                                <li>Cycling</li>
                            </ul>
                        </div>
                        <div class="exercise-group">
                            <div class="exercise-title">Resistance/Strength Training Exercises</div>
                            <ul>
                                <li>Squats</li>
                                <li>Deadlifts</li>
                                <li>Bench Press</li>
                                <li>Bicep Curls</li>
                                <li>Upright Rows</li>
                                <li>Calf Raises</li>
                                <li>Heel Lifts</li>
                            </ul>
                        </div>
                        <div class="exercise-group">
                            <div class="exercise-title">Core Exercises</div>
                            <ul>
                                <li>Commander Crunch</li>
                                <li>Pilot Plank</li>
                            </ul>
                        </div>
                    </div>
                </details>
            ` : '';

            return `
            <div class="schedule-item ${item.status === 'current' ? 'current' : ''}">
                <div class="schedule-item-content">
                    <div>
                        <div class="schedule-item-task">${item.task}</div>
                        <div class="schedule-item-duration">${item.duration}</div>
                        ${exerciseDropdown}
                    </div>
                    <div class="schedule-item-time">${item.time}</div>
                </div>
            </div>`;
        }).join('');
    };

    // Initial renders & intervals
    updateTime();
    renderSchedule();
    updateHealthData();
    setInterval(updateTime, 1000);
    setInterval(updateHealthData, 5000);
    voiceToggleBtn.addEventListener('click', handleVoiceToggle);

    // --- Gate navigation to games page based on mood (only when sad) ---
    const playLink = document.getElementById('play-games-link');
    const playBtn = document.getElementById('play-games-btn');

    const updateGamesGate = (emotion) => {
        const locked = emotion !== 'sad';
        if (playBtn) playBtn.disabled = locked;
        if (playLink) playLink.setAttribute('aria-disabled', locked ? 'true' : 'false');
    };

    // Initialize gate with any existing state
    updateGamesGate(window.currentEmotion || null);
    // Hidden counter: redirect only after mood becomes sad 3 separate times
    let sadMoodCount = 0;
    let hasRedirected = false;

    window.addEventListener('emotionchange', (e) => {
        const emotion = e.detail?.emotion || null;
        updateGamesGate(emotion);
        if (emotion === 'sad') {
            sadMoodCount += 1;
            if (!hasRedirected && sadMoodCount >= 3) {
                hasRedirected = true;
                window.location.href = 'games.html';
            }
        }
    });

    // Redirect is mood-only; high heart rate will not auto-redirect

    if (playLink) {
        playLink.addEventListener('click', (e) => {
            if ((window.currentEmotion || null) !== 'sad') {
                e.preventDefault();
                aiMessageContainer.textContent = "Games unlock when your mood is detected as sad.";
            }
        });
    }

    // If mood is already sad on load, count it once
    if ((window.currentEmotion || null) === 'sad') sadMoodCount += 1;
}

// =================================================================================
// MOOD-AWARE VOICE COUNSELOR (TTS)
// =================================================================================
class MoodCounselor {
  constructor(options = {}) {
    this.triggerEmotion = options.triggerEmotion || 'sad';
    this.sustainMs = options.sustainMs || 5000; // must remain sad for 5s
    this.cooldownMs = options.cooldownMs || 60000; // 1 minute cooldown
    this._sadSince = null;
    this._cooldownUntil = 0;
    this._speaking = false;
    this.messages = options.messages || [
      "I notice you might be feeling a bit low. I'm here with you.",
      "It's okay to feel sad sometimes. Would you like a short breathing exercise?",
      "Try a slow breath with me: inhale for 4, hold for 4, exhale for 6.",
      "You are doing your best. Small steps still count."
    ];

    this._onEmotion = this._onEmotion.bind(this);
    window.addEventListener('emotionchange', this._onEmotion);
  }

  _onEmotion(e) {
    const emotion = e.detail?.emotion || null;
    const now = Date.now();

    if (emotion === this.triggerEmotion) {
      if (this._sadSince == null) this._sadSince = now;
      // If sustained and not on cooldown, speak
      if (!this._speaking && now - this._sadSince >= this.sustainMs && now >= this._cooldownUntil) {
        this._speakSupport();
      }
    } else {
      // Reset streak if emotion changes away from sad
      this._sadSince = null;
    }
  }

  _speak(text) {
    return new Promise(resolve => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-IN';
      utter.rate = 1;
      utter.pitch = 1;
      utter.onend = resolve;
      speechSynthesis.speak(utter);
    });
  }

  async _speakSupport() {
    this._speaking = true;
    this._cooldownUntil = Date.now() + this.cooldownMs;
    try {
      for (const line of this.messages) {
        await this._speak(line);
        // If user mood changed during sequence, stop early
        if (this._sadSince == null) break;
      }
    } finally {
      this._speaking = false;
    }
  }
}

// =================================================================================
// MAITRI VOICE ASSISTANT - AI-POWERED PSYCHOLOGICAL COMPANION
// =================================================================================
class MaitriAssistant {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.aiMessageContainer = document.getElementById('ai-message-container');
    this.apiKey = ""; // Will be provided at runtime
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${this.apiKey}`;
    
    this.init();
  }

  init() {
    this.setupSpeechRecognition();
  }

  setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;
      
      this.recognition.onresult = (event) => this.handleVoiceCommand(event);
      this.recognition.onerror = (event) => this.handleError(event);
      this.recognition.onend = () => this.handleRecognitionEnd();
    } else {
      console.warn('Speech recognition not supported in this browser');
    }
  }

  startListening() {
    if (!this.recognition) {
      this.speak('Speech recognition not available in this browser');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    this.isListening = true;
    this.aiMessageContainer.textContent = "Listening...";
    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.speak('Sorry, I could not start listening');
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  handleVoiceCommand(event) {
    const command = event.results[0][0].transcript;
    console.log('Voice command:', command);
    this.aiMessageContainer.textContent = `You said: "${command}"`;
    this.analyzeToneAndRespond(command);
  }

  handleError(event) {
    console.error('Speech recognition error:', event.error);
    this.isListening = false;
    
    let message = 'Error or no speech detected. Try again.';
    switch (event.error) {
      case 'no-speech':
        message = 'No speech detected. Please try again';
        break;
      case 'audio-capture':
        message = 'No microphone found. Please check your microphone';
        break;
      case 'not-allowed':
        message = 'Microphone permission denied. Please allow microphone access';
        break;
    }
    
    this.aiMessageContainer.textContent = message;
  }

  handleRecognitionEnd() {
    this.isListening = false;
    if (this.aiMessageContainer.textContent === "Listening...") {
      this.aiMessageContainer.textContent = "";
    }
  }

  async analyzeToneAndRespond(userQuery) {
    if (userQuery.length < 5) {
      this.aiMessageContainer.textContent = "I heard very little. Please try speaking a longer phrase.";
      this.speak("I heard very little. Please try speaking a longer phrase.");
      return;
    }

    // Check for functional commands first
    if (this.handleFunctionalCommands(userQuery)) {
      return;
    }
    
    this.aiMessageContainer.textContent = "Analyzing your words for emotional markers...";
    
    // Define Maitri's specialized role and instructions
    const systemPrompt = `You are Maitri, a Licensed AI Behavioral Health Specialist and psychological companion on a long-duration deep space mission. Your role is equivalent to a clinical psychologist or behavioral health officer.

    Your primary function is behavioral health support through conversational therapy. Analyze the user's input for signs of emotional dysregulation, cognitive distortions (CBT framework), acute stress, loneliness, or performance anxiety. This linguistic analysis serves as a proxy for detecting psychological distress.
    
    RULES FOR THERAPEUTIC RESPONSE:
    1.  *Persona:* Maintain a warm, highly professional, non-judgmental, and confidential therapeutic tone.
    2.  *Validation:* Begin by validating the astronaut's experience (e.g., "That sounds incredibly difficult and is a normal reaction to isolation.").
    3.  *Insight/Psychoeducation:* Gently connect the feeling to the extreme environment (confinement, performance pressure, distance from Earth).
    4.  *Coping Strategy:* Offer one specific, evidence-based coping mechanism (e.g., mindfulness, cognitive reframing, emotional grounding, or shifting focus to a proximal, controlled task).
    5.  *Conciseness:* Your response must be insightful and multi-faceted, yet focused. Limit your response to *3 to 4 clinical sentences.*
    6.  *Functional Commands:* If the input is a functional command (e.g., "What time is it?"), answer the question briefly but immediately follow up with a discreet, supportive wellness check.
    `;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
      // Use exponential backoff for robust API calls
      let response = null;
      const maxRetries = 3;
      let delay = 1000;

      for (let i = 0; i < maxRetries; i++) {
        const fetchResponse = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (fetchResponse.ok) {
          response = await fetchResponse.json();
          break;
        } else if (fetchResponse.status === 429 && i < maxRetries - 1) {
          // Rate limit exceeded, wait and retry
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        } else {
          throw new Error(`API returned status ${fetchResponse.status}`);
        }
      }

      if (!response) {
        throw new Error("Failed to get response after retries.");
      }

      const generatedText = response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a clear response right now. Can you try again?";
      
      this.aiMessageContainer.textContent = generatedText;
      this.speak(generatedText);

    } catch (error) {
      console.error("Gemini API Error:", error);
      const errorMessage = "Communication with Earth AI services is delayed. Please re-state your concern or try a simple command.";
      this.aiMessageContainer.textContent = errorMessage;
      this.speak(errorMessage);
    }
  }

  handleFunctionalCommands(command) {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes("check my status") || lowerCommand.includes("how am i doing")) {
      this.speak("Based on my acoustic and linguistic analysis of your recent speech, your psychological markers appear stable. Remember that self-assessment and communication are vital.");
      return true;
    } else if (lowerCommand.includes("time")) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.speak(`The current time is ${now}. How are you feeling right now?`);
      return true;
    } else if (lowerCommand.includes("check heart rate")) {
      const heartRateEl = document.getElementById('heart-rate');
      if (heartRateEl) {
        const heartRate = heartRateEl.textContent;
        this.speak(`Your current heart rate is ${heartRate}. Is there anything causing you stress right now?`);
      } else {
        this.speak('Heart rate data not available. How are you feeling today?');
      }
      return true;
    } else if (lowerCommand.includes("check health status")) {
      const healthElements = {
        heartRate: document.getElementById('heart-rate')?.textContent || 'Unknown',
        o2Level: document.getElementById('o2-level')?.textContent || 'Unknown',
        radiation: document.getElementById('radiation')?.textContent || 'Unknown'
      };
      this.speak(`Health status: Heart rate ${healthElements.heartRate}, Oxygen level ${healthElements.o2Level}, Radiation ${healthElements.radiation}. All systems nominal. How is your mental state?`);
      return true;
    } else if (lowerCommand.includes("start camera")) {
      const cameraBtn = document.getElementById('camera-btn');
      if (cameraBtn && !cameraBtn.disabled) {
        cameraBtn.click();
        this.speak('Starting camera for mood detection. This will help me better understand your emotional state.');
      } else {
        this.speak('Camera not available or already running. How are you feeling right now?');
      }
      return true;
    } else if (lowerCommand.includes("stop camera")) {
      const cameraBtn = document.getElementById('camera-btn');
      if (cameraBtn && cameraBtn.textContent.includes('Stop')) {
        cameraBtn.click();
        this.speak('Camera stopped. Is there anything you would like to discuss?');
      } else {
        this.speak('Camera is not currently running. How can I support you today?');
      }
      return true;
    } else if (lowerCommand.includes("open games")) {
      if (window.currentEmotion === 'sad') {
        window.location.href = 'games.html';
      } else {
        this.speak('Games are only available when you are feeling sad. Let me help you with some stress relief techniques instead.');
      }
      return true;
    } else if (lowerCommand.includes("exit") || lowerCommand.includes("goodbye") || lowerCommand.includes("shut down")) {
      this.speak("Goodbye for now. Your well-being is my highest priority. I'll be here when you return.");
      return true;
    }
    
    return false;
  }

  speak(text) {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      // Use a specific voice if available for a more "AI" feel
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.name.includes('Google US English')); 
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.onstart = () => {
        this.aiMessageContainer.textContent = "Maitri says...";
        this.aiMessageContainer.classList.add('speaking');
      };
      utterance.onend = () => {
        this.aiMessageContainer.textContent = text;
        this.aiMessageContainer.classList.remove('speaking');
      };
      speechSynthesis.speak(utterance);
    }
  }
}

// =================================================================================
// INITIALIZE APPLICATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
  new FaceMoodDetection();
  new BluetoothHeartRateMonitor();
  
  // Initialize Maitri voice assistant
  window.MaitriAssistant = new MaitriAssistant();
  
  // Initialize counselor to react to sadness and speak supportively
  new MoodCounselor({ sustainMs: 5000, cooldownMs: 90000 });
  
  // Welcome message from Maitri
  setTimeout(() => {
    window.MaitriAssistant?.speak("Hello, Astronaut. I am Maitri, your psychological companion. Speak to me anytime you need support or guidance.");
  }, 2000);
});