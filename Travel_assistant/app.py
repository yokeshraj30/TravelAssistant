from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from huggingface_hub import InferenceClient
from groq import Groq
import requests
import os

app = Flask(__name__)
CORS(app)

hf_client = InferenceClient(token="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")
groq_client = Groq(api_key="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")

# Language configuration
SUPPORTED_LANGUAGES = {
    'en': 'English',
    'ta': 'Tamil',
    'te': 'Telugu',
    'hi': 'Hindi'
}

def translate_text(text, target_language):
    """
    Translate text using Groq API
    """
    if target_language == 'en':
        return text

    prompt = f"""Translate the following text to {SUPPORTED_LANGUAGES[target_language]}:
    Text: {text}
    Translation:"""

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=1024,
            top_p=1,
            stream=False
        )

        return completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"Translation error: {str(e)}")
        return text

def translate_places_list(places, target_language):
    """
    Translate place names and amenity types
    """
    if target_language == 'en':
        return places

    translated_places = []
    for place in places:
        translated_place = place.copy()
        translated_place['name'] = translate_text(place['name'], target_language)
        translated_place['amenity'] = translate_text(place['amenity'], target_language)
        translated_places.append(translated_place)

    return translated_places

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        prompt = data.get('prompt')
        user_location = data.get('userLocation')
        language = data.get('language', 'en')

        # Translate user prompt to English if not already in English
        if language != 'en':
            english_prompt = translate_text(prompt, 'en')
        else:
            english_prompt = prompt

        response = hf_client.text_generation(
            model="mistralai/Mistral-7B-Instruct-v0.2",
            prompt=f"<s>[INST] You are a helpful travel assistant. Help the user with their travel query. If the query is about a location, include the coordinates in the format (latitude, longitude). Current user location: {user_location}. Query: {english_prompt} [/INST]",
            max_new_tokens=200,
            temperature=0.7,
            top_p=0.95
        )

        # Translate response back to user's language if needed
        if language != 'en':
            translated_response = translate_text(response, language)
        else:
            translated_response = response

        return jsonify({"response": translated_response})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/nearby', methods=['POST'])
def get_nearby_places():
    try:
        data = request.json
        lat = data.get('lat')
        lon = data.get('lon')
        amenity = data.get('amenity')
        radius = data.get('radius', 60000)
        language = data.get('language', 'en')

        overpass_url = "http://overpass-api.de/api/interpreter"
        query = f"""
        [out:json];
        (
          node["amenity"="{amenity}"](around:{radius},{lat},{lon});
        );
        out body;
        """

        response = requests.post(overpass_url, data=query)
        places = response.json()

        results = []
        for element in places.get('elements', [])[:10]:
            results.append({
                'name': element.get('tags', {}).get('name', 'Unnamed'),
                'lat': element.get('lat'),
                'lon': element.get('lon'),
                'amenity': amenity
            })

        # Translate place names and amenity types if needed
        if language != 'en':
            results = translate_places_list(results, language)

        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)