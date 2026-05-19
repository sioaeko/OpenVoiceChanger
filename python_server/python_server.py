import asyncio
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import torch
import onnxruntime as ort
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

rvc_model = None
onnx_model = None

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')


def load_models():
    global rvc_model, onnx_model

    rvc_path = os.path.join(MODEL_DIR, 'rvc_model.pt')
    if os.path.exists(rvc_path):
        rvc_model = torch.jit.load(rvc_path)
        rvc_model.eval()
        logger.info('RVC model loaded successfully')
    else:
        logger.warning(f'RVC model not found at {rvc_path}')

    onnx_path = os.path.join(MODEL_DIR, 'voice_changer.onnx')
    if os.path.exists(onnx_path):
        onnx_model = ort.InferenceSession(onnx_path)
        logger.info('ONNX model loaded successfully')
    else:
        logger.warning(f'ONNX model not found at {onnx_path}')


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()
    yield
    logger.info('Shutting down...')


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "rvc_loaded": rvc_model is not None,
        "onnx_loaded": onnx_model is not None,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")
    try:
        while True:
            data = await websocket.receive_json()
            audio_data = np.array(data['audio'], dtype=np.float32)
            model_type = data.get('model', 'ONNX')
            settings = data.get('settings', {})

            try:
                if model_type == 'RVC':
                    output = process_rvc(audio_data, settings)
                else:
                    output = process_onnx(audio_data, settings)

                await websocket.send_json({
                    "type": "processedAudio",
                    "audio": output.tolist()
                })
            except Exception as e:
                logger.error(f"Processing error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


def process_rvc(audio_data, settings):
    if rvc_model is None:
        raise RuntimeError("RVC model not loaded")

    with torch.no_grad():
        input_tensor = torch.FloatTensor(audio_data).unsqueeze(0)
        if torch.cuda.is_available():
            input_tensor = input_tensor.cuda()
        output = rvc_model(input_tensor)
    return output.cpu().numpy().squeeze()


def process_onnx(audio_data, settings):
    if onnx_model is None:
        raise RuntimeError("ONNX model not loaded")

    input_name = onnx_model.get_inputs()[0].name
    output_name = onnx_model.get_outputs()[0].name
    output = onnx_model.run(
        [output_name],
        {input_name: audio_data.reshape(1, -1)}
    )[0]
    return output.squeeze()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
