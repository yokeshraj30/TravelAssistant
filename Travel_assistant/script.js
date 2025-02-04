const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = false;
recognition.lang = 'en-US';
const synthesis = window.speechSynthesis;

const AZURE_SPEECH_KEY = 'BKcGwBuh2Ix5W2ob8GvkWTK67cAXfnt4Rf5rh6l2orum6fMDCV2pJQQJ99ALACYeBjFXJ3w3AAAYACOG6Bz3';
const AZURE_SPEECH_REGION = 'eastus';

class SpeechService {
    constructor() {
        // Load the Azure Speech SDK
        this.loadAzureSpeechSDK();
        this.synthesizer = null;
        this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
    }

    async loadAzureSpeechSDK() {
        // Load Microsoft Cognitive Services Speech SDK
        const script = document.createElement('script');
        script.src = 'https://aka.ms/csspeech/jsbrowserpackageraw';
        script.async = true;
        script.onload = () => this.initializeAzureSpeech();
        document.body.appendChild(script);
    }

    initializeAzureSpeech() { 
        if (window.SpeechSDK) {
            const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
                AZURE_SPEECH_KEY,
                AZURE_SPEECH_REGION
            );
            // Set speech synthesis language to Tamil
            speechConfig.speechSynthesisLanguage = 'ta-IN';
            speechConfig.speechSynthesisVoiceName = 'ta-IN-PallaviNeural';

            this.synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
        }
    }

    startListening() {
        return new Promise((resolve, reject) => {
            try {
                this.recognition.start();

                this.recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    resolve(transcript);
                };

                this.recognition.onerror = (event) => {
                    reject(event.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    stopListening() {
        this.recognition.stop();
    }

    speak(text) {
        return new Promise((resolve, reject) => {
            if (!this.synthesizer) {
                reject('Speech synthesizer not initialized');
                return;
            }

            this.synthesizer.speakTextAsync(
                text,
                result => {
                    if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                        resolve();
                    } else {
                        reject(`Speech synthesis failed: ${result.errorDetails}`);
                    }
                },
                error => {
                    reject(error);
                }
            );
        });
    }

    cancelSpeech() {
        if (this.synthesizer) {
            this.synthesizer.close();
        }
    }

    setLanguage(language) {
        if (this.synthesizer) {
            const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
                AZURE_SPEECH_KEY,
                AZURE_SPEECH_REGION
            );

            // Map language codes to Azure voice names
            const voiceMap = {
                'ta': 'ta-IN-PallaviNeural',
                'te': 'te-IN-ShrutiNeural',
                'hi': 'hi-IN-SwaraNeural',
                'en': 'en-IN-NeerjaNeural'
            };

            speechConfig.speechSynthesisVoiceName = voiceMap[language] || voiceMap['en'];
            this.synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
        }
    }
}

class PlaceManager {
    constructor() {
        this.currentPlaces = [];
    }

    setPlaces(places) {
        this.currentPlaces = places;
    }

    getPlaceByNumber(number) {
        const index = number - 1;
        return this.currentPlaces[index] || null;
    }

    formatPlacesList() {
        if (this.currentPlaces.length === 0) return '';

        return this.currentPlaces
            .map((place, index) => `${index + 1}. ${place.name}`)
            .join('\n');
    }
}
class MapManager {
  constructor() {
      this.map = L.map('map').setView([51.505, -0.09], 13);
      this.userMarker = null;
      this.destinationMarker = null;
      this.placeMarkers = [];
      this.routingControl = null;
      this.currentLanguage = 'en';

      // Translations for common map messages
      this.translations = {
          en: {
              youAreHere: 'You are here!',
              destination: 'Destination',
              locationButton: 'Go to my location',
              error: 'Error fetching nearby places'
          },
          ta: {
              youAreHere: 'நீங்கள் இங்கே இருக்கிறீர்கள்!',
              destination: 'இலக்கு',
              locationButton: 'எனது இருப்பிடத்திற்குச் செல்லவும்',
              error: 'அருகிலுள்ள இடங்களைக் கண்டறிவதில் பிழை'
          },
          te: {
              youAreHere: 'మీరు ఇక్కడ ఉన్నారు!',
              destination: 'గమ్యం',
              locationButton: 'నా స్థానానికి వెళ్ళండి',
              error: 'సమీప ప్రదేశాలను పొందడంలో లోపం'
          },
          hi: {
              youAreHere: 'आप यहाँ हैं!',
              destination: 'गंतव्य',
              locationButton: 'मेरे स्थान पर जाएं',
              error: 'आस-पास की जगहें खोजने में त्रुटि'
          }
      };

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);

      this.initializeUserLocation();
      this.initializeClickHandler();
      this.addLocationButton();
  }

  setLanguage(language) {
      this.currentLanguage = language;
      // Update existing markers and popups
      this.updateExistingMarkers();
  }

  getText(key) {
      return this.translations[this.currentLanguage]?.[key] || this.translations['en'][key];
  }

  async translateText(text) {
      if (this.currentLanguage === 'en') return text;

      try {
          const response = await fetch('http://localhost:5000/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  prompt: text,
                  userLocation: 'unknown',
                  language: this.currentLanguage
              })
          });

          const data = await response.json();
          return data.response;
      } catch (error) {
          console.error('Translation error:', error);
          return text;
      }
  }

  updateExistingMarkers() {
      // Update user marker
      if (this.userMarker) {
          this.userMarker.setPopupContent(this.getText('youAreHere'));
      }

      // Update destination marker
      if (this.destinationMarker) {
          this.destinationMarker.setPopupContent(this.getText('destination'));
      }

      // Update place markers
      this.updatePlaceMarkers();
  }

  addLocationButton() {
      const locationControl = L.Control.extend({
          options: {
              position: 'bottomright'
          },

          onAdd: () => {
              const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
              const button = L.DomUtil.create('a', 'location-button', container);
              button.innerHTML = `
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="3"/>
                  </svg>
              `;
              button.href = '#';
              button.title = this.getText('locationButton');

              L.DomEvent.on(button, 'click', (e) => {
                  L.DomEvent.preventDefault(e);
                  this.centerOnUser();
              });

              return container;
          }
      });

      this.map.addControl(new locationControl());
  }

  async initializeUserLocation() {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(async position => {
              const { latitude, longitude } = position.coords;
              this.userLocation = { lat: latitude, lng: longitude };
              this.map.setView([latitude, longitude], 13);

              if (this.userMarker) {
                  this.map.removeLayer(this.userMarker);
              }

              this.userMarker = L.marker([latitude, longitude]).addTo(this.map)
                  .bindPopup(this.getText('youAreHere'))
                  .openPopup();
          });
      }
  }

  initializeClickHandler() {
      this.map.on('click', (e) => {
          const { lat, lng } = e.latlng;
          this.setDestination(lat, lng);
      });
  }

  async setDestination(lat, lng) {
      if (this.destinationMarker) {
          this.map.removeLayer(this.destinationMarker);
      }

      this.destinationMarker = L.marker([lat, lng]).addTo(this.map)
          .bindPopup(this.getText('destination'))
          .openPopup();

      if (this.userLocation) {
          this.calculateRoute(
              [this.userLocation.lat, this.userLocation.lng],
              [lat, lng]
          );
      }
  }

  calculateRoute(start, end) {
      if (this.routingControl) {
          this.map.removeControl(this.routingControl);
      }

      this.routingControl = L.Routing.control({
          waypoints: [
              L.latLng(start[0], start[1]),
              L.latLng(end[0], end[1])
          ],
          routeWhileDragging: true,
          lineOptions: {
              styles: [{ color: '#3b82f6', weight: 4 }]
          }
      }).addTo(this.map);
  }

  clearPlaceMarkers() {
      this.placeMarkers.forEach(marker => this.map.removeLayer(marker));
      this.placeMarkers = [];
  }

  async updatePlaceMarkers() {
      for (const marker of this.placeMarkers) {
          const popup = marker.getPopup();
          if (popup) {
              const content = popup.getContent();
              const translatedContent = await this.translateText(content);
              marker.setPopupContent(translatedContent);
          }
      }
  }

  async searchNearbyPlaces(amenity, radius = 60000) {
      if (!this.userLocation) return [];

      try {
          const response = await fetch('http://localhost:5000/nearby', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  lat: this.userLocation.lat,
                  lon: this.userLocation.lng,
                  amenity,
                  radius,
                  language: this.currentLanguage
              })
          });

          const places = await response.json();
          this.clearPlaceMarkers();

          for (const place of places) {
              const popupContent = `<b>${place.name}</b><br>${place.amenity}`;
              const translatedContent = await this.translateText(popupContent);

              const marker = L.marker([place.lat, place.lon])
                  .bindPopup(translatedContent)
                  .addTo(this.map);

              marker.on('click', () => {
                  this.calculateRoute(
                      [this.userLocation.lat, this.userLocation.lng],
                      [place.lat, place.lon]
                  );
              });

              this.placeMarkers.push(marker);
          }

          return places;
      } catch (error) {
          console.error(this.getText('error'), error);
          return [];
      }
  }
}
class ChatManager {
  constructor(mapManager) {
      this.mapManager = mapManager;
      this.placeManager = new PlaceManager();
      this.speechService = new SpeechService();
      this.messageContainer = document.getElementById('chatMessages');
      this.userInput = document.getElementById('userInput');
      this.sendButton = document.getElementById('sendButton');
      this.micButton = document.getElementById('micButton');
      this.languageSelect = document.getElementById('languageSelect');
      this.isListening = false;

      // Language-specific speech recognition settings
      this.languageSettings = {
          'en': 'en-US',
          'ta': 'ta-IN',
          'te': 'te-IN',
          'hi': 'hi-IN'
      };

      this.sendButton.addEventListener('click', () => this.handleSend());
      this.userInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.handleSend();
      });
      this.micButton.addEventListener('click', () => this.toggleListening());
      this.languageSelect.addEventListener('change', () => this.handleLanguageChange());
  }

  handleLanguageChange() {
      const selectedLanguage = this.languageSelect.value;
      // Update speech recognition language
      this.speechService.recognition.lang = this.languageSettings[selectedLanguage] || 'en-US';
  }

  async toggleListening() {
      if (this.isListening) {
          this.speechService.stopListening();
          this.isListening = false;
          this.micButton.classList.remove('listening');
          return;
      }

      try {
          this.micButton.classList.add('listening');
          this.isListening = true;
          const transcript = await this.speechService.startListening();

          if (transcript) {
              this.userInput.value = transcript;
              this.handleSend();
          }
      } catch (error) {
          console.error('Speech recognition error:', error);
      } finally {
          this.micButton.classList.remove('listening');
          this.isListening = false;
      }
  }

  async handleSend() {
      const message = this.userInput.value.trim();
      if (!message) return;

      this.userInput.value = '';
      this.addMessage(message, 'user');
      this.addTypingIndicator();

      try {
          const selectedLanguage = this.languageSelect.value;
          const numberMatch = message.match(/(?:go to|route to|show|select)(?:\s+hospital)?\s+(\d+)/i);

          if (numberMatch) {
              const selectedNumber = parseInt(numberMatch[1]);
              const place = this.placeManager.getPlaceByNumber(selectedNumber);

              if (place) {
                  this.removeTypingIndicator();
                  this.mapManager.calculateRoute(
                      [this.mapManager.userLocation.lat, this.mapManager.userLocation.lng],
                      [place.lat, place.lon]
                  );

                  const response = await fetch('http://localhost:5000/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          prompt: `Showing route to ${place.name}`,
                          userLocation: `${this.mapManager.userLocation.lat},${this.mapManager.userLocation.lng}`,
                          language: selectedLanguage
                      })
                  });

                  const data = await response.json();
                  this.addMessage(data.response, 'bot');
                  return;
              }
          }

          if (message.toLowerCase().includes('hospital')) {
              await this.handleNearbySearch('hospital');
              return;
          }

          if (message.toLowerCase().includes('fuel') || message.toLowerCase().includes('gas station')) {
              await this.handleNearbySearch('fuel');
              return;
          }

          if (message.toLowerCase().includes('bus')) {
              await this.handleNearbySearch('bus_station');
              return;
          }

          const userLocation = this.mapManager.userLocation
              ? `${this.mapManager.userLocation.lat},${this.mapManager.userLocation.lng}`
              : 'unknown';

          const response = await fetch('http://localhost:5000/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  prompt: message,
                  userLocation,
                  language: selectedLanguage
              })
          });

          const data = await response.json();
          this.removeTypingIndicator();
          this.addMessage(data.response, 'bot');
      } catch (error) {
          console.error('Error:', error);
          this.removeTypingIndicator();
          this.addMessage('Sorry, I encountered an error. Please try again.', 'bot');
      }
  }

  async handleNearbySearch(amenity) {
      const selectedLanguage = this.languageSelect.value;
      const places = await this.mapManager.searchNearbyPlaces(amenity);
      this.removeTypingIndicator();

      if (places.length > 0) {
          this.placeManager.setPlaces(places);
          const placesList = this.placeManager.formatPlacesList();
          const message = `I found ${places.length} ${amenity.replace('_', ' ')}(s) near you:\n\n${placesList}\n\nYou can say "go to 1" or "route to 2" to get directions to a specific location.`;

          // Translate the response if not in English
          if (selectedLanguage !== 'en') {
              const response = await fetch('http://localhost:5000/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      prompt: message,
                      userLocation: 'unknown',
                      language: selectedLanguage
                  })
              });

              const data = await response.json();
              this.addMessage(data.response, 'bot');
          } else {
              this.addMessage(message, 'bot');
          }
      } else {
          const message = `Sorry, I couldn't find any ${amenity.replace('_', ' ')}s nearby.`;

          if (selectedLanguage !== 'en') {
              const response = await fetch('http://localhost:5000/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      prompt: message,
                      userLocation: 'unknown',
                      language: selectedLanguage
                  })
              });

              const data = await response.json();
              this.addMessage(data.response, 'bot');
          } else {
              this.addMessage(message, 'bot');
          }
      }
  }
  addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.innerHTML = text.replace(/\n/g, '<br>');

    if (sender === 'bot') {
        const speakButton = document.createElement('button');
        speakButton.className = 'speak-btn speech-control-btn';
        speakButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
        `;

        speakButton.addEventListener('click', async () => {
            const textToSpeak = text.replace(/<br>/g, '\n');
            try {
                // Update speech service language based on current selection
                this.speechService.setLanguage(this.languageSelect.value);
                await this.speechService.speak(textToSpeak);
            } catch (error) {
                console.error('Speech synthesis error:', error);
            }
        });

        messageDiv.appendChild(speakButton);
    }

    this.messageContainer.appendChild(messageDiv);
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
}

  addTypingIndicator() {
      const indicator = document.createElement('div');
      indicator.className = 'message bot-message typing-indicator';
      indicator.innerHTML = '<span></span><span></span><span></span>';
      indicator.id = 'typingIndicator';
      this.messageContainer.appendChild(indicator);
      this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }

  removeTypingIndicator() {
      const indicator = document.getElementById('typingIndicator');
      if (indicator) indicator.remove();
  }

  async sendMessage(message) {
      this.userInput.value = message;
      await this.handleSend();
  }
}

// Initialize the application
const mapManager = new MapManager();
const chatManager = new ChatManager(mapManager);