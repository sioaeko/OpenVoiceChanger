# OpenVoiceChanger

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

<p align="center">
  실시간 AI 보이스 체인저 웹 애플리케이션.<br/>
  ONNX 또는 RVC 모델을 낮은 지연의 WebSocket 오디오 파이프라인으로 연결합니다.
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> •
  <a href="#모델-지원">모델 지원</a> •
  <a href="#api">API</a> •
  <a href="#설정">설정</a> •
  <a href="README.md">English</a> •
  <a href="README_JP.md">日本語</a>
</p>

---

## 기능

### 실시간 스튜디오
- AudioWorklet + 바이너리 WebSocket 기반 실시간 음성 변환
- ONNX와 RVC 모델 지원 + **모델 없이 동작하는 DSP 모드** (체크포인트 없이 피치 시프트와 이펙트 사용)
- 실시간 피치 **및 포먼트** 시프트, **F0 방식 16종**(PM / Harvest / DIO, Crepe·Mangio-Crepe, RMVPE, FCPE, 각 ONNX 변형, 오프라인 하이브리드) — 이 PC에 런타임이나 모델 자산이 없는 방식은 이유와 함께 회색으로 표시 — 그리고 RVC 고급 파라미터(index rate, filter radius, RMS mix, protect, Crepe hop length)
- **서버 사이드 12종 이펙트 랙**: 노이즈 게이트, 로봇, 위스퍼, 전화기, 디스토션, 비트크러시, 코러스, 에코, 리버브, 톤 EQ, 컴프레서, 출력 게인 — 모두 스트리밍 상태 유지형
- **내장 보이스 프리셋 16종** (다람쥐, 저음, 로봇, 유령, 전화, 스타디움 등) + Voice Lab 전체 상태를 저장하는 사용자 프리셋
- **Silence Saver** — 무음이 이어지면 무거운 모델 추론을 쉬게 하면서 DSP 잔향은 유지하고, 소리가 들어오는 첫 청크에서 즉시 재개
- **실측 성능 프로필** (Responsive / Balanced / Stable) — 최근 p95 왕복 지연과 서버 처리시간으로 청크 크기 추천
- 실시간 스펙트럼 비주얼라이저, 피크 홀드 VU 미터, 레이턴시 스파크라인, 서버 처리시간 분석(모델/DSP/네트워크), 추론 duty 모니터링
- **출력 녹음기** — 변환된 목소리를 녹음(<kbd>R</kbd>)해 타임스탬프가 붙은 WAV로 저장, <kbd>B</kbd>는 A/B 바이패스 전환
- **녹음 보관함**: 여러 WAV 테이크를 브라우저 IndexedDB에 보관하고 이름 변경, 재생, 다운로드, 확인 후 삭제를 지원합니다. 같은 주소에서 새로고침해도 복원되지만 브라우저 데이터 삭제·자동 정리로 사라질 수 있으므로 중요한 녹음은 다운로드하세요. 저장 실패 시 현재 탭에서 다운로드와 재저장이 가능합니다.
- **스트림 진단**: 입력 청크 시간, 대기 중인 오디오, 재생 버퍼, 브라우저가 보고한 출력 지연, 누락·시간 초과 프레임, 버퍼 부족과 재생 잘림을 구분합니다. 왕복 지연은 전송과 처리 시간이며 마이크부터 스피커까지의 총지연 실측값이 아닙니다. 카운터는 스트림·연결 단위로 초기화하고 낮은 빈도로 갱신합니다.
- 활성 모델의 추론 실패는 원음 전환 대신 무음 처리와 오류 표시로 대응합니다. 선택한 출력 장치 연결 실패 시 기본 스피커로 전환하지 않고 시작을 중단합니다.
- 서버가 끊기면 지수 백오프로 자동 재연결, 기다리기 싫으면 **Retry now**로 즉시 재시도

### 오프라인 변환
- 오디오 파일(wav / mp3 / flac / ogg / m4a)을 업로드해 활성 모델 + 현재 Voice Lab 설정 + 이펙트 체인으로 렌더링 후 WAV 다운로드, 긴 변환은 중간에 취소 가능

### 관리
- 드래그 앤 드롭 모델 업로드(`.pth` / `.pt` / `.onnx` + 동반 `.index` 파일), 한 번에 하나의 모델 활성화
- 모델 메타데이터 배지: RVC 버전, 타깃 샘플레이트, F0 지원, index 유무, 디바이스
- 라이트/다크 테마, 전송 성능 프로필, Silence Saver, ONNX / PyTorch / GPU / CUDA 런타임 상태를 한곳에서 관리하는 설정 모달
- **RVC 준비 상태**: Models와 설정에서 필수 패키지·HuBERT, 선택적 F0 자산, 설치 안내와 재검사를 제공합니다. 파일·패키지 감지는 실제 추론 성공을 의미하지 않으며 모델 로딩으로 실행 여부를 확인합니다. 서버 재연결 시 음성·전송 설정은 유지하고 기능 정보와 프리셋을 갱신합니다.
- 앱 안에서 업데이트를 확인하고 관리 런처를 통해 원클릭 **Update and restart** ([업데이트](#업데이트) 참조)
- 링크로 공유할 수 있는 탭(`?tab=models`, `?tab=converter`, `?settings`) — 탭을 오가도 고른 파일이나 진행 중인 변환이 유지되고, 브라우저 뒤로/앞으로가 탭 사이를 이동
- 키보드 포커스가 명확한 Lucide 아이콘 컨트롤과 표준 tablist 내비게이션 + 일반 저장소 링크로 자연스럽게 전환되는 명시적 GitHub Star 동작

## 스크린샷

모든 캡처는 RVC 런타임이 설치되지 않은 PC에서 모델 없는 DSP 모드로 스튜디오를 실제로 돌리며
찍은 것입니다. F0 선택기가 각 방식을 "unavailable"로 표시하는 이유가 그것이며, 추론 스택을
설치하기 전 사용자가 보게 되는 화면 그대로입니다.

### 스튜디오

![스튜디오 — 스트리밍 중인 실시간 워크스페이스](docs/images/main-ui.png)

**Deep Voice** 프리셋을 적용해 스트리밍 중인 실시간 워크스페이스: 입력/출력 라이브 스펙트럼,
피크 홀드 VU 미터, 5 ms 왕복 지연과 스파크라인 및 DSP/네트워크 분해, 녹음 진행 중인 테이크,
그리고 피치·포먼트·F0 방식 컨트롤.

### 프리셋 & 이펙트 랙

![보이스 프리셋과 DSP 이펙트 랙](docs/images/effects-rack.png)

원클릭 보이스 프리셋 16종과 서버 사이드 12종 DSP 체인. 여기서는 **Ghost**가 선택되어
위스퍼·에코·리버브가 켜져 있습니다. 사용자 프리셋은 F0, retrieval, filter, RMS, protect,
Crepe hop 설정까지 함께 기억합니다. 모델이 없어도 전부 동작하며, 이펙트를 켜면 라이브
스트림에 즉시 반영됩니다.

### 모델

![모델 베이](docs/images/models.png)

RVC / ONNX 체크포인트와 동반 `.index` 파일의 드래그 앤 드롭 업로드, 메타데이터 배지, 원클릭 활성화.

### 컨버터

![오프라인 파일 변환](docs/images/converter.png)

오디오 파일 전체를 활성 모델 + 이펙트 체인으로 렌더링한 뒤 미리 듣고 WAV로 다운로드합니다.
RVC 변환은 실시간 스트림의 짧은 컨텍스트 창을 쓰지 않고 파일 전체를 처리하며,
현재 Index Rate, Filter Radius, RMS Mix, Protect 값도 그대로 반영합니다.

### 설정

![세션 런타임 설정](docs/images/settings-modal.png)

업데이트 상태, 라이브 스트림에서 **실측한 추천**이 붙은 전송 성능 프로필, Silence Saver 설정,
라이트/다크 테마, 그리고 백엔드가 인식한 ONNX provider, PyTorch device, GPU, CUDA 상태를 보여줍니다.

이 이미지들은 손으로 캡처한 것이 아니라 생성한 것입니다. `node scripts/readme_screenshots.mjs`가
실행 중인 백엔드에 대해 헤드리스 Chromium을 띄우고 합성 음성을 마이크로 넣어 촬영합니다.

## 빠른 시작

아래 명령은 Windows PowerShell 기준이며, 저장소 루트에서 실행합니다.

### 0. 저장소 클론

```powershell
git clone https://github.com/sioaeko/OpenVoiceChanger.git
cd OpenVoiceChanger
```

### 1. 백엔드 설치

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
pip install --no-deps git+https://github.com/RVC-Project/Retrieval-based-Voice-Conversion
```

### 2. 선택 사항: ONNX GPU 가속 활성화

기본 `requirements.txt`는 CPU용 ONNX Runtime을 설치합니다. 로컬 CUDA 가속을 쓰려면 CPU 패키지를 지우고 GPU 패키지로 교체합니다.

```powershell
pip uninstall -y onnxruntime
pip install onnxruntime-gpu==1.23.2
```

### 3. 프론트엔드 설치

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 4. 모델 자산 준비

**Windows x64 CPU 자동 설치:** `python launch.py`로 실행한 뒤
**Models > RVC readiness > Set up RVC > Install and restart**를 누르세요.
`data/rvc-setup/`에 별도 Python 3.10.20 환경과 해시 고정 CPU 패키지,
커밋 고정 RVC/fairseq 추론 소스를 설치하고 HuBERT·RMVPE를 SHA-256 검증 후
다운로드합니다. 모델 자산은 353.5 MiB이며 Python·패키지는 별도입니다.
최소 6 GiB 여유 공간이 필요합니다. 기존 Python/CUDA, 음성 모델, 프리셋과
녹음 테이크는 덮어쓰지 않습니다. 라우팅·변환을 중지하고 미저장 녹음을
저장한 뒤 설치하세요. 실제 HuBERT/RMVPE 추론과 API import 검사 후에만
서버를 전환하며 재시작 실패 시 이전 환경으로 복구합니다. 전환 전 취소와
검증된 다운로드를 재사용하는 재시도를 지원합니다.
로그는 `data/rvc-setup/jobs/<job-id>/setup.log`에 남고 실패한 환경도 진단용으로
보존합니다. GPU 가속, 음성 체크포인트, 학습용 확장 및 선택적 ONNX F0 가중치는
포함하지 않습니다. 다른 운영체제는 수동 설치를 사용하세요. 다음 실행에도
관리형 런처가 설치 환경을 기억하며 직접 실행한 `uvicorn`에는 적용되지 않습니다.

다운로드 출처·해시는 [`setup_manifest.py`](backend/services/setup_manifest.py),
패키지 목록·잠금 파일은 [`backend/runtime/`](backend/runtime/)에 있습니다.
고정된 HuBERT 해시가 일치할 때만 레거시 설정 객체 로딩을 허용하며,
사용자가 업로드한 음성 체크포인트의 안전 로딩 제한은 유지합니다.

수동 설치 시:

RVC `.pth` / `.pt` 모델을 쓰려면 HuBERT 콘텐츠 인코더 파일이 필요합니다.

```powershell
New-Item -ItemType Directory -Force models\assets | Out-Null
```

파일 위치:

```text
models/assets/hubert_base.pt
```

다른 위치를 쓰려면 `OVC_HUBERT_PATH`를 설정하면 됩니다.

### 5. 앱 실행

```powershell
.venv\Scripts\python.exe launch.py
```

브라우저에서 여세요:

```text
http://127.0.0.1:8000
```

### 6. 선택 사항: Vite 개발 모드

터미널 1:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

터미널 2:

```powershell
cd frontend
npm run dev
```

그 다음 `http://127.0.0.1:5173`로 접속하면 됩니다.

## 업데이트

시작할 때와 매시간 공식 GitHub의 공개 릴리스를 확인합니다. 현재 버전보다 높은 안정 버전(`vMAJOR.MINOR.PATCH`)이 있을 때만 헤더에 **Update available** 버튼이 나타납니다. 초안, 사전 릴리스, 일반 커밋은 알림 대상이 아닙니다. 설정에서 수동 확인도 가능하며, 요청은 분당 1회로 제한됩니다. 사용자 동의 없이 설치하지 않습니다.

**Update and restart**는 `python launch.py` 실행, Git 설치, 공식 `origin`, 수정 사항이 없는 `main` 브랜치가 필요합니다. 런처가 미리 빌드된 프론트엔드를 다운로드하고 GitHub의 SHA-256 및 파일별 매니페스트를 검증한 뒤, 검증한 릴리스 커밋으로 fast-forward하고 서버를 재시작합니다. GitHub 로그인, 로컬 Node.js 빌드, pip 설치, CUDA 교체는 하지 않습니다. Python 의존성이 바뀐 릴리스는 수동 업데이트가 필요합니다. ZIP 소스 설치나 `uvicorn` 직접 실행에서는 알림만 지원합니다.

- 설치 전 음성 라우팅을 중지해야 합니다. 서버도 업로드, 파일 변환, 최근 오디오 처리 중에는 설치를 차단합니다.
- 녹음 저장 완료를 기다리거나 저장 실패 테이크를 다운로드하고, 미저장 변환 결과도 다운로드한 뒤 재시작합니다. 저장된 테이크는 업데이트를 막지 않습니다. 다른 열린 탭은 자동 새로고침하지 않습니다.
- 모델, `data/presets.json`, 브라우저에 저장된 설정은 유지됩니다. 새 서버가 시작되지 않으면 이전 코드와 화면을 복원합니다. 도중에 로컬 코드가 수정되면 덮어쓰지 않고 복구를 중단합니다.
- 복구 파일은 `tmp/updater/jobs/`에 남습니다. 복구에 실패하면 저장소를 변경하기 전에 `tmp/updater/state.json`과 런처 로그를 확인하세요.
- `OVC_UPDATE_CHECK_ENABLED=false`로 백그라운드 GitHub 확인을 끌 수 있으며 수동 확인은 계속 가능합니다. CORS를 개방해도 설치는 같은 컴퓨터에서만 허용됩니다.

배포자는 `VERSION`과 프론트엔드의 두 패키지 버전을 함께 올려 `main`에 커밋한 뒤 같은 `vX.Y.Z` 태그를 푸시합니다. Release 워크플로가 테스트와 빌드를 수행하고 `OpenVoiceChanger-frontend-vX.Y.Z.zip` 및 체크섬을 초안에 업로드한 다음 공개합니다. `python scripts/package_release.py`는 깨끗한 빌드 완료 저장소에서 패키지만 만들며 게시하지 않습니다. 첫 릴리스부터 이 배포 경로가 준비되며, 설치된 앱에는 자신의 버전보다 높은 릴리스만 표시됩니다.

## 모델 지원

| 형식 | 엔진 | 비고 |
|------|------|------|
| `.onnx` | ONNX Runtime | 기본은 CPU, `onnxruntime-gpu` 설치 시 CUDA 사용 |
| `.pth` / `.pt` | PyTorch | RVC v1/v2, `hubert_base.pt` 필요 |

## 웹 UI 사용 순서

1. 브라우저에서 앱을 엽니다.
2. (선택) `Models` 탭에서 모델을 업로드하고 활성화합니다 — 모델이 없으면 순수 DSP 모드로 동작합니다.
3. 필요하면 Settings에서 성능 프로필과 Silence Saver 임계값을 조정합니다.
4. `Studio` 탭에서 입력/출력 장치를 고릅니다.
5. `Start Voice Changer`를 누릅니다.
6. 피치, 포먼트, F0 방식, 이펙트 랙, 원클릭 프리셋으로 목소리를 실시간으로 바꿉니다.
7. <kbd>B</kbd> 키(또는 `A/B Monitor`)로 스트림을 멈추지 않고 변환음과 원음을 비교합니다.
8. 출력을 녹음하거나(<kbd>R</kbd>로 녹음 시작/정지) `Converter` 탭에서 파일 전체를 변환합니다.

한 글자 단축키는 입력 필드에 타이핑하는 동안에는 동작하지 않으며, 탭을 바꿔도 다른 탭에서 하던 작업은 초기화되지 않습니다.

## API

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/health` | 헬스 체크 |
| `GET` | `/api/config` | 앱 버전, 스트림 및 Silence Saver 기본값, ONNX/PyTorch 런타임 정보, F0 방식별 사용 가능 여부 |
| `GET` | `/api/updates` | 캐시된 릴리스 상태, 현재 버전, 설치 진행 단계 |
| `POST` | `/api/updates/check` | 명시적인 로컬 업데이트 확인 (호출 횟수 제한) |
| `POST` | `/api/updates/install` | 검증된 버전의 설치와 재시작 예약 (관리 런처 전용) |
| `GET` | `/api/github/star` | 현재 GitHub CLI 계정의 Star 상태 확인 |
| `POST` | `/api/github/star` | 같은 기기의 브라우저에서 명시적으로 눌렀을 때 이 저장소에 Star 추가 |
| `GET` | `/api/models/` | 업로드된 모델 목록 |
| `POST` | `/api/models/upload` | 모델 업로드 |
| `DELETE` | `/api/models/{name}` | 모델 삭제 |
| `POST` | `/api/models/{name}/activate` | 모델 활성화 |
| `POST` | `/api/models/deactivate` | 현재 모델 비활성화 |
| `GET` | `/api/models/active` | 현재 활성 모델 조회 |
| `GET` | `/api/presets/` | 내장 + 사용자 프리셋 목록 |
| `POST` | `/api/presets/` | 사용자 프리셋 저장 |
| `DELETE` | `/api/presets/{id}` | 사용자 프리셋 삭제 |
| `POST` | `/api/convert/` | 오프라인 파일 변환 (multipart 업로드 → WAV) |
| `WS` | `/ws/audio` | 실시간 오디오 스트리밍 |

백엔드 실행 중 `/docs`에서 Swagger UI를 볼 수 있습니다.

### WebSocket 프로토콜

1. `/ws/audio`에 연결
2. JSON 설정 전송: `{"sample_rate": 40000, "chunk_size": 4096}`
3. 바이너리 오디오 프레임 전송: `[uint32 seq_num][uint32 reserved][float32[] PCM samples]`
4. 같은 형식으로 처리된 오디오 프레임 수신 — 응답의 `reserved` 필드에 서버 처리시간(1/100 ms 단위)이 담깁니다
5. 필요할 때 설정 전송:
   `{"pitch_shift": 3.0, "formant_shift": -2.0, "f0_method": "rmvpe", "index_rate": 0.75, "filter_radius": 3, "rms_mix_rate": 0.25, "protect": 0.33, "crepe_hop_length": 160, "silence_saver": true, "silence_threshold_db": -52, "effects": {"reverb": {"enabled": true, "size": 0.6, "mix": 0.4}}}`
6. 주기적 상태 JSON 수신: `{"type": "status", "latency_ms": …, "model_ms": …, "dsp_ms": …, "mode": "rvc|onnx|dsp|bypass", "bypass": false, "inference_sleeping": false, "inference_duty_percent": 100.0, "effects_active": …}`

모든 설정 필드는 선택 사항이며 알 수 없는 필드는 무시되므로, 이 릴리스 전후의
클라이언트와 서버가 서로 호환됩니다.

서버는 청크를 한 번에 하나씩 처리하므로, 응답보다 빠르게 보내면 큐만 쌓이고 그 큐가
그대로 자신의 지연으로 돌아옵니다. 기본 프론트엔드는 **전송 중 프레임을 1개**만 두고
최대 2개를 대기시키며, 넘치면 가장 오래된 대기 프레임을 버리고(라이브 모니터에서는
새 오디오가 오래된 오디오보다 낫습니다), 응답이 2초 동안 오지 않는 프레임은 포기해서
응답 하나가 유실돼도 송신이 멈추지 않게 합니다. 외부 클라이언트도 같은 백프레셔를
적용하는 것이 좋습니다.

초기 config에 보내는 샘플 레이트는 요청값이 아니라 `AudioContext`가 **실제로**
동작하는 레이트(`audioContext.sampleRate`)여야 합니다. 브라우저는 요청을 무시할
수 있고, 서버는 여기서 보고된 값으로 처리·리샘플링합니다.

#### 변환 바이패스 (A/B)

`{"bypass": true}`는 입력 신호를 그대로 반환합니다. 노이즈 게이트, 모델, 피치·
포먼트 시프트, 이펙트 랙을 모두 거치지 않습니다. 마이크, WebSocket, 출력
라우팅은 계속 동작하므로 중지가 아니라 변환된 소리와의 진짜 A/B 비교가 됩니다.
UI에서는 <kbd>B</kbd> 키로 전환할 수 있습니다.

이는 이펙트 랙의 **Bypass all** 버튼과 다릅니다. 후자는 이펙트만 해제하고 모델
변환은 계속 실행됩니다.

#### 성능 프로필과 Silence Saver

Settings의 **Responsive**, **Balanced**, **Stable** 프로필은 각각 2048, 4096,
8192 샘플 청크를 사용합니다. 라이브 측정값이 8개 이상 모이면 최근 p95 왕복 지연과
모델 + DSP 처리시간을 이용해 처리 여유가 있는 가장 작은 프로필을 추천합니다. 라우팅
중 선택한 프로필은 다음 세션에 적용되며, 수동 샘플 레이트와 청크 크기는 라우팅을
멈출 때까지 잠깁니다.

Silence Saver는 기본적으로 `-52 dB`에서 켜지며 `-80`부터 `-20 dB`까지 조절할 수
있습니다. 모델이 활성화된 상태에서 입력이 180 ms 동안 임계값 아래에 머물면 해당
스트림의 모델 컨텍스트를 해제하고 추론을 건너뜁니다. 에코와 리버브 잔향이 자연스럽게
사라지도록 무음으로 post-effect 단계는 계속 실행하고, 소리가 들어오는 첫 청크에서
다시 깨어납니다. 모니터의 `Saver`는 현재 절전 상태, `Duty`는 모델 추론 대상 프레임 중
실제로 추론한 비율입니다. DSP 전용 모드는 절전하지 않습니다.

#### GitHub Star 버튼

헤더 버튼은 이 저장소에 대한 한 가지 동작만 투명하게 수행합니다. 루프백 브라우저에서
사용자가 직접 누르면 현재 인증된 GitHub CLI(`gh`) 계정으로
`sioaeko/OpenVoiceChanger`에 Star를 추가하며, 인증 정보는 프론트엔드로 전달되지
않습니다. `gh`가 없거나 인증되지 않았거나 연결할 수 없거나 다른 기기에서 접속한 경우,
버튼은 사용자가 GitHub에서 직접 결정할 수 있는 일반 저장소 링크로 바뀝니다.

## 설정

환경 변수는 `OVC_` 접두사를 사용합니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OVC_MODELS_DIR` | `models` | 모델 디렉토리 |
| `OVC_HOST` | `127.0.0.1` | 백엔드 바인드 주소 — 기본값은 루프백 전용 |
| `OVC_PORT` | `8000` | 백엔드 포트 |
| `OVC_SAMPLE_RATE` | `40000` | 클라이언트에 제안하는 샘플 레이트 (실제 레이트는 브라우저가 보고) |
| `OVC_CHUNK_SIZE` | `4096` | 기본 청크 크기 |
| `OVC_CORS_ORIGINS` | `["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"]` | HTTP와 오디오 WebSocket 모두에 적용되는 origin 허용 목록 |
| `OVC_ALLOW_ANY_ORIGIN` | `false` | origin 검증 완전 비활성화 (신뢰할 수 있는 네트워크 전용) |
| `OVC_LOG_LEVEL` | `info` | 로그 레벨 |
| `OVC_HUBERT_PATH` | `models/assets/hubert_base.pt` | RVC용 HuBERT 경로 |
| `OVC_RMVPE_ROOT` | `models/assets/rmvpe` | RMVPE 자산 디렉토리(`rmvpe.pt`) — `rmvpe` F0 방식 활성화 |
| `OVC_RMVPE_ONNX_PATH` | `models/assets/rmvpe/rmvpe.onnx` | ONNX RMVPE 모델 — `rmvpe-onnx` 활성화 |
| `OVC_CREPE_ONNX_FULL_PATH` | `models/assets/crepe/full.onnx` | ONNX Crepe(full) 모델 — `crepe-onnx-full` 활성화 |
| `OVC_CREPE_ONNX_TINY_PATH` | `models/assets/crepe/tiny.onnx` | ONNX Crepe(tiny) 모델 — `crepe-onnx-tiny` 활성화 |
| `OVC_CREPE_HOP_LENGTH` | `160` | Mangio-Crepe 방식의 기본 hop length (64–512) |
| `OVC_RVC_STREAM_CONTEXT_SECONDS` | `0.14` | 각 스트림이 추론을 다시 수행하는 16 kHz 히스토리 길이 |
| `OVC_RVC_INDEX_RATE` | `0.75` | 매칭되는 `.index`가 있을 때 retrieval mix |
| `OVC_RVC_FILTER_RADIUS` | `3` | Harvest / DIO median filter 반경 (3 미만이면 비활성) |
| `OVC_RVC_RMS_MIX_RATE` | `0.25` | RMS envelope blend |
| `OVC_RVC_PROTECT` | `0.33` | 자음 보호 값 |
| `OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS` | `false` | 안전 로딩에 실패한 체크포인트의 unpickle 허용 ([보안](#보안) 참조) |
| `OVC_PRESETS_PATH` | `data/presets.json` | 사용자 프리셋 저장 파일 |
| `OVC_MAX_CONVERT_SECONDS` | `600` | 오프라인 변환 최대 오디오 길이 |
| `OVC_UPDATE_CHECK_ENABLED` | `true` | 시작 시 및 매시간 공개 릴리스 확인. 클릭 없이 설치하지 않음 |

`OVC_RVC_STREAM_CONTEXT_SECONDS`는 버퍼 크기가 아니라 지연 시간과 품질의
트레이드오프입니다. 모든 청크가 이 윈도우 전체에 대해 추론되므로 값을 키우면
연속성은 좋아지지만 청크당 추론 비용이 배가됩니다. 기본 4096 샘플 청크에서는
`0.14`가 실시간 여유를 유지합니다.

## 보안

이 스튜디오는 모델 체크포인트를 업로드하고 실행하며 마이크를 열기 때문에,
기본값은 1인 사용자 머신을 전제로 합니다.

### 네트워크 접근

- **바인드 주소**: `OVC_HOST`의 기본값은 `127.0.0.1`입니다. 변경하지 않는 한
  머신 외부에서 API에 접근할 수 없습니다.
- **origin**: 크로스 오리진 HTTP 요청과 WebSocket 핸드셰이크는
  `OVC_CORS_ORIGINS`로 검증됩니다. `Origin` 헤더가 없는 요청(curl, 네이티브
  클라이언트, 테스트)은 허용되며, 불투명한 `null` origin은 거부됩니다.
- **same-origin은 항상 허용**: 이 백엔드가 제공한 페이지는 어떤 주소에서도
  검증을 통과하므로, 프론트엔드를 LAN 호스트로 옮겨도 허용 목록을 수정할 필요가
  없습니다. 악의적인 제3자 페이지는 브라우저가 그 페이지 자신의 origin을 보내기
  때문에 통과할 수 없습니다.

브라우저는 WebSocket에 same-origin 정책을 적용하지 않으므로, 이 검증이 없으면
방문한 아무 웹사이트나 이 백엔드를 통해 마이크 스트림을 열 수 있습니다.

네트워크의 다른 기기에서 사용하려면:

```bash
OVC_HOST=0.0.0.0 python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

같은 백엔드에서 빌드된 프론트엔드를 제공한다면 추가 설정이 필요 없습니다.
Vite 개발 서버를 *다른* 호스트에서 실행할 때만 해당 origin을 추가하세요:

```bash
export OVC_CORS_ORIGINS='["http://192.168.1.50:5173"]'
```

참고로 브라우저는 보안 origin에서만 마이크 캡처를 허용합니다. 일반 HTTP에서는
`localhost` 외에는 `getUserMedia`를 사용할 수 없습니다. LAN 배포에는 HTTPS를
사용하거나 호스트 머신에서 사용하세요.

### 모델 체크포인트

RVC `.pth` 파일은 Python pickle이므로 PyTorch의 레거시 `weights_only=False`로
로드하면 파일 작성자가 넣은 코드가 실행됩니다. 체크포인트는 웹 업로드
엔드포인트를 통해 들어오므로, 백엔드는 PyTorch의 안전한 weights-only 모드로
로드합니다(numpy 값을 저장한 체크포인트도 읽을 수 있도록 데이터 전용 numpy
심볼을 추가했습니다).

그 방식으로 로드할 수 없는 체크포인트는 조용히 unpickle하지 않고 설명이 포함된
오류와 함께 활성화가 실패합니다. 신뢰하는 파일에 한해 배포별로 명시적으로
옵트인하세요:

```bash
OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS=true python -m uvicorn backend.main:app
```

이 경로를 사용할 때마다 백엔드는 파일 이름이 포함된 경고를 로그에 남깁니다.

## 테스트

```bash
pip install -r backend/requirements-test.txt
python -m pytest          # 백엔드

cd frontend && npm install
npm run lint              # ESLint (react-hooks 규칙은 오류로 처리)
npm test                  # 프론트엔드 (vitest: lib 모듈 + SSR 컴포넌트 검사)
npm run build
```

`backend/requirements-test.txt`는 의도적으로 `backend/requirements.txt`보다 가볍습니다.
테스트는 전송 계층, DSP 체인, 오프라인 변환기, origin 검증, 체크포인트 로딩, 업데이터를
다루며 어느 것도 RVC 추론 스택 전체를 필요로 하지 않습니다. CI(`.github/workflows/ci.yml`)는
Linux에서 백엔드 스위트, Windows에서 업데이터·설치 테스트, 프론트엔드 lint·테스트·빌드를
실행합니다. 별도 Windows 작업은 `python -m scripts.verify_runtime_setup`으로 빈 캐시에
새로 다운로드하고 HuBERT/RMVPE 추론, 관리형 서버의 두 차례 시작과 완전 종료를 검사합니다.
이 네트워크 검증에는 최소 6 GiB 여유 공간이 필요하며 진단용 독립 환경은
`tmp/runtime-cold-*`에 남습니다.

프론트엔드 테스트는 Node·jsdom·SSR을 사용하므로 실제 브라우저 동작은 별도로 확인합니다.
`node scripts/readme_screenshots.mjs`는 헤드리스 Chromium에서 실제 스트림을 시작하는
스모크 테스트 역할도 합니다.

## 프로젝트 구조

```text
OpenVoiceChanger/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── security.py
│   ├── version.py
│   ├── routers/
│   └── services/
├── frontend/
│   ├── public/
│   └── src/
├── tests/
├── scripts/            # 릴리스 패키징, README 스크린샷 생성기
├── docs/images/
├── models/
├── .github/workflows/  # ci.yml, release.yml
├── launch.py           # 관리 런처 (앱 내 업데이트 지원)
├── VERSION
├── README.md
├── README_KR.md
├── README_JP.md
└── Makefile
```

## Makefile

`Makefile`은 POSIX 셸 또는 WSL용 보조 도구입니다.

| 명령 | 설명 |
|------|------|
| `make install` | 백엔드와 프론트엔드 의존성 설치 |
| `make install-test` | 백엔드 테스트 의존성 설치 |
| `make dev` | 백엔드와 프론트엔드 개발 서버 실행 |
| `make dev-backend` | 백엔드만 실행 |
| `make dev-frontend` | 프론트엔드만 실행 |
| `make lint` | 프론트엔드 lint |
| `make test` | 백엔드와 프론트엔드 테스트 실행 |
| `make test-backend` | 백엔드 테스트만 실행 |
| `make test-frontend` | 프론트엔드 테스트만 실행 |
| `make build` | 프론트엔드 빌드 |
| `make clean` | 빌드 산출물 제거 |

## 요구 사항

- Python 3.10+
- Node.js 20.19+ (Vitest 4와 ESLint 10은 Node 18에서 동작하지 않습니다)
- npm

## 라이선스

[MIT](LICENSE)
