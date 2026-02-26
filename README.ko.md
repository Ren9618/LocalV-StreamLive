# LocalV-StreamLive 🤖🎙️

🌍 Read this in other languages: [日本語](README.md) | [English](README.en.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

LocalV-StreamLive는 개인정보 보호를 중시하며 사용자의 PC에서 완전히 오프라인으로 실행되는 AI 방송 봇 및 어시스턴트 도구 모음입니다.
현재 메인 앱으로 YouTube Live 방송 댓글에 센스 있고 유쾌하게 반응하는 AI 마스코트 **"Stream Companion"** 을 제공하고 있습니다.

## ✨ 기능 (Features)

*   **🔒 100% 로컬 실행:** Ollama(LLM) 및 VOICEVOX(음성 합성)를 백엔드로 사용합니다. 외부 서버로 데이터가 전송되지 않으며, API 키나 종량제 요금이 필요하지 않습니다.
    *   *참고: OpenAI API와 호환되는 제공자도 지원합니다 (Ollama 실행이 버겁거나 자체 API 키를 사용하려는 경우).*
*   **🌐 5개 국어 지원 (i18n):** 한국어, 영어, 일본어, 중국어(간체/번체)를 지원합니다. 시스템 언어 자동 감지 및 앱 내 수동 전환이 가능합니다.
*   **🧠 고급 기억 시스템:**
    *   **단기 기억:** 대화의 최근 문맥을 이해하여 자연스러운 상호작용을 구현합니다 (기억 유지 횟수 조정 가능).
    *   **시청자 기억 (SQLite):** 데이터베이스에 각 시청자별 댓글 횟수 및 특징을 기록합니다. 자주 오는 단골 시청자에게는 친근하게 반응합니다.
*   **🎯 지능형 필터링 시스템:**
    *   **지정 모드:** `!ai`와 같은 특정 트리거 단어가 포함된 댓글에만 AI가 반응하도록 설정할 수 있습니다.
    *   **빠른 답장:** 흔한 인사나 슈퍼챗(SuperChat)에 대해 AI보다 먼저 지정된 문구로 빠르게 응답합니다.
    *   **블랙리스트:** 특정 단어가 포함된 댓글을 자동으로 무시합니다.
*   **📺 OBS Studio 연동 (오버레이):**
    *   **투명 자막 오버레이:** OBS에서 브라우저 소스로 불러오기만 하면 방송 화면에 AI의 답변이 투명 배경의 자막으로 표시됩니다.
    *   **건너뛰기 숨김:** `[건너뛰기]` 또는 `[무시]` 등의 접두사가 붙은 AI 사고 로그는 화면에서 자동으로 숨겨집니다.
    *   **커스텀 디자인:** 앱 설정 화면에서 직관적으로 테두리 색상, 글꼴 크기, 애니메이션 속도 등을 변경할 수 있습니다.
*   **🎧 오디오 출력 라우팅:** 가상 오디오 장치(예: VB-Cable)로 오디오를 출력하여 OBS에서 소리를 개별적으로 캡처할 수 있습니다.
*   **✨ 새 기능 및 관리:**
    *   **Voiceger 연동:** 새로운 TTS 엔진으로 "Voiceger"를 통합했습니다. 설정 전환에 따른 자동 리소스 관리(VRAM 해제) 및 오류 발생 시 폴백 처리를 구현했습니다.
    *   **디버그 로그 UI:** 앱 동작 시각화. UI에서 "디버그 로그" 토글을 켜면 AI 워밍업이나 오류 상태 등 문제 해결 정보를 실시간으로 확인할 수 있습니다.
    *   **🧹 자동 메모리 해제:** 앱 종료 시나 설정 변경 시 VRAM에서 Ollama LLM 모델 및 TTS 프로세스를 자동으로 언로드하는 메모리 관리 기능이 포함되어 있습니다.

## 🏗️ 아키텍처

*   **Frontend:** React + TypeScript + Vite
*   **Backend:** Electron + Node.js
*   **Database:** SQLite3 (시청자 데이터 영구 저장)
*   **Local AI Engine:** [Ollama](https://ollama.ai/)
*   **Local Voice Engine:** [VOICEVOX](https://voicevox.hiroshiba.jp/)

## 🚀 설치 및 시작 (Getting Started)

### 1. 사전 준비 (필수)
1.  **Ollama (LLM)**: [공식 홈페이지](https://ollama.ai/)에서 설치한 후, 터미널에서 `ollama run llama3.1` 등의 명령어로 사전에 AI 모델을 다운로드 및 로드해 둡니다.
2.  **VoiceVox (음성 합성 - 옵션 1)**: [공식 홈페이지](https://voicevox.hiroshiba.jp/)에서 설치 후 앱을 실행하고 에디터 창을 열어 둡니다 (기본적으로 `50021` 포트에서 대기).
3.  **Voiceger (음성 합성 - 옵션 2)**: 가볍고 빠른 대안으로 Voiceger를 사용할 수 있습니다. 해당 자습서에 따라 Python 환경과 API 서버를 구축하거나 앱에 포함된 스크립트로 자동 시작을 설정합니다 (기본적으로 `8000` 포트에서 대기).
4.  **가상 오디오 (선택 사항)**: OBS에서 오디오를 분리하려면 [VB-Cable](https://vb-audio.com/Cable/) 설치를 권장합니다.

### 2. 설정
```bash
git clone https://github.com/Ren9618/LocalV-StreamLive.git
cd LocalV-StreamLive/apps/stream-companion/electron-app
npm install
```

### 3. 실행
```bash
npm run dev
```

## 🎥 OBS 연동 가이드

### 🔊 오디오 연동
1. 앱의 "설정" > "오디오 설정"에서 출력 장치(예: "CABLE Input")를 선택합니다.
2. OBS에서 "오디오 입력 캡처"를 추가하고 "CABLE Output"을 선택합니다.

### 📺 댓글 연동
1. 앱 우측 하단의 "🔗 OBS용 URL 복사"를 클릭하고 복사된 URL(`http://localhost:25252/`)을 사용합니다.
2. OBS에서 "브라우저" 소스를 추가하고 해당 URL을 붙여넣습니다.
3. 앱 "설정" 탭의 "OBS 오버레이 설정"에서 미리보기를 보며 글꼴 크기, 색상, 배경 및 애니메이션 효과를 직관적으로 사용자 정의할 수 있습니다.

## 📜 라이선스
이 프로젝트는 [MIT 라이선스](LICENSE) 조건에 따라 배포됩니다.

**크레딧 (Credits):**
*   본 애플리케이션의 음성 합성에는 **VOICEVOX**가 사용되었습니다.
*   방송이나 동영상 제작 등에 사용하실 때는 반드시 "**VOICEVOX:(캐릭터 이름)**" 등의 크레딧 표기를 해주시기 바랍니다. 자세한 내용은 [VOICEVOX 이용 규약](https://voicevox.hiroshiba.jp/term/)을 확인해 주세요.

**면책 조항:**  
본 소프트웨어는 생성형 AI를 사용합니다. AI가 생성한 결과물에 대한 책임은 지지 않습니다. VOICEVOX 등 외부 도구를 사용할 때는 해당 서비스의 이용 약관을 반드시 준수하시기 바랍니다.
