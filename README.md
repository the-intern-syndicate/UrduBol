# 🎙️ Urdu Lecture Transcriber

## 🚀 What We Built
The Urdu Lecture Transcriber is a real-time web application designed to make COMSATS university lectures more accessible. We built a reactive Streamlit dashboard that captures live microphone audio and transcribes spoken Urdu into text instantly. By leveraging highly optimized, open-weight AI running strictly locally, this tool protects student data and operates flawlessly even with unstable campus internet connections.

## 🧠 How the AI Works
Open-weight AI is the core engine of this project. Instead of calling a paid, closed-source API, we process audio entirely on-device using **Faster-Whisper**. 
1. Live audio is captured via the browser and chunked into manageable segments.
2. The audio is fed into our local Whisper model, utilizing the **CTranslate2** inference engine.
3. By applying INT8 quantization, we dynamically compress the model's weights, allowing the heavy transformer architecture to run at 4x speed on a standard laptop CPU without crashing.

## 🛠️ Built With
*   **Frontend:** Streamlit, streamlit-mic-recorder
*   **AI/Inference:** Faster-Whisper, CTranslate2
*   **AI Model:** OpenAI Whisper (Large-v3-Turbo / Urdu Fine-Tuned)
*   **AI Pair Programmer:** GitHub Copilot

## 🤖 How GitHub Copilot Helped
We actively used GitHub Copilot as our AI pair programmer throughout the hackathon to accelerate development. Specifically, Copilot helped us by:
*   **Generating Boilerplate:** Copilot wrote the entire initial Streamlit frontend structure, including the sidebar, dynamic text placeholders (`st.empty()`), and state management variables. 
*   **Solving Audio Chunking:** When we struggled to efficiently chunk live audio arrays from the microphone recorder into the format required by `faster-whisper`, Copilot generated the necessary NumPy reshaping logic, saving us hours of debugging.
*   **Documentation:** Copilot assisted in structuring our code comments and drafting this markdown documentation.

## ⚖️️ Open Source & Model Licensing
This project is fully open-source and submitted under the **MIT License**. 

The AI models and inference engines used in this project are freely available open-weight/open-source technologies:
*   **Model:** [OpenAI Whisper](https://github.com/openai/whisper) (Released under the [MIT License](https://github.com/openai/whisper/blob/main/LICENSE))
*   **Inference Engine:** [Faster-Whisper / CTranslate2](https://github.com/SYSTRAN/faster-whisper) (Released under the MIT License)

## 💻 Run the Demo Locally
1. Clone this repository: `git clone https://github.com/your-username/urdu-lecture-transcriber.git`
2. Navigate to the directory: `cd urdu-lecture-transcriber`
3. Install dependencies: `pip install -r requirements.txt`
4. Run the dashboard: `streamlit run app.py`
5. Click "Start Recording" and speak Urdu into your microphone!
