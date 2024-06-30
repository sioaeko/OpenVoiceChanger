import asyncio
import numpy as np
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import torch
import onnxruntime as ort

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 모델 로드
rvc_model = None
onnx_model = None

async def load_models():
    global rvc_model, onnx_model
    # RVC 모델 로드 (PyTorch 사용)
    rvc_model = torch.jit.load('models/rvc_model.pt')
    rvc_model.eval()
    
    # ONNX 모델 로드
    onnx_model = ort.InferenceSession('models/voice_changer.onnx')

@app.on_event("startup")
async def startup_event():
    await load_models()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            audio_data = np.array(data['audio'], dtype=np.float32)
            model_type = data['model']
            settings = data['settings']

            if model_type == 'RVC':
                output = process_rvc(audio_data, settings)
            else:
                output = process_onnx(audio_data, settings)

            await websocket.send_json({"audio": output.tolist()})
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

def process_rvc(audio_data, settings):
    # RVC 모델 처리 로직
    with torch.no_grad():
        input_tensor = torch.FloatTensor(audio_data).unsqueeze(0)
        output = rvc_model(input_tensor, settings)
    return output.numpy().squeeze()

def process_onnx(audio_data, settings):
    # ONNX 모델 처리 로직
    input_name = onnx_model.get_inputs()[0].name
    output_name = onnx_model.get_outputs()[0].name
    output = onnx_model.run([output_name], {input_name: audio_data.reshape(1, -1)})[0]
    return output.squeeze()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
