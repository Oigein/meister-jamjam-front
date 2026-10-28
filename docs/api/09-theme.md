## 1. 개요

- **관련 기능 명세**: 테마 커스텀기능 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 로그인 사용자의 배경(GIF·MP4)과 폰트 크기 설정을 계정에 저장해 기기 간 동기화. 비로그인 상태는 브라우저 LocalStorage에만 저장하며 API를 호출하지 않음
- **프론트 전용 동작**: 미리보기, 탭 이동 시 일시정지, 저전력·데이터 절약 모드 감지, 로딩 실패 시 썸네일·단색 대체는 서버가 관여하지 않음

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/me/theme` | 로그인 | 내 테마 설정 조회 |
| PUT | `/api/me/theme` | 로그인 | 내 테마 설정 저장 |
| DELETE | `/api/me/theme` | 로그인 | 기본 테마로 초기화 |
| GET | `/api/theme/presets` | 로그인 | 기본 제공 GIF·비디오 목록 |
| POST | `/api/me/theme/assets` | 로그인 | 배경 파일 업로드 |
| DELETE | `/api/me/theme/assets/{assetId}` | 로그인(본인) | 업로드한 배경 파일 삭제 |

## 2. 상세 API

### 2.1. 내 테마 설정 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/me/theme` |
| **권한** | 로그인 |
| **설명** | 앱 진입 시 호출. 저장된 설정이 없으면 기본값을 반환 |

**Response 200**

```json
{
  "background": {
    "type": "MP4",
    "source": "UPLOAD",
    "presetId": null,
    "assetId": "ab12cd34-0000-4000-8000-000000000001",
    "url": "https://cdn.example.com/themes/ab12cd34.mp4",
    "thumbnailUrl": "https://cdn.example.com/themes/ab12cd34.jpg",
    "fit": "COVER",
    "opacity": 100,
    "dim": 30,
    "blur": 0
  },
  "fontScale": "M",
  "textShadow": true,
  "pauseOnLowPower": true,
  "autoplayOnDataSaver": false,
  "updatedAt": "2026-10-29T11:00:00+09:00"
}
```

| **필드** | **설명** |
| --- | --- |
| `background.type` | `NONE` / `GIF` / `MP4` |
| `background.source` | `PRESET`(기본 제공) / `UPLOAD`(직접 업로드). `NONE`이면 `null` |
| `background.thumbnailUrl` | 첫 프레임 이미지. 로딩 실패·저전력 모드에서 정지 화면으로 사용 |
| `background.fit` | GIF: `COVER`(기본) / `TILE` / `CONTAIN`. MP4는 항상 `COVER` |
| `opacity`, `dim`, `blur` | 0~100 정수. `dim`은 검은 오버레이 농도 |
| `fontScale` | `XS`(85%) / `S`(92%) / `M`(100%, 기본) / `L`(115%) / `XL`(130%) |
| `textShadow` | 텍스트 그림자. 기본 `true` |
| `pauseOnLowPower` | 저전력 모드에서 애니메이션 정지. 기본 `true` |
| `autoplayOnDataSaver` | 데이터 절약 모드에서도 자동 재생. 기본 `false` |

**기본값**: `type: NONE`, `dim: 0`, `blur: 0`, `opacity: 100`, `fontScale: M`, `textShadow: true`, `pauseOnLowPower: true`, `autoplayOnDataSaver: false`

### 2.2. 내 테마 설정 저장

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `PUT /api/me/theme` |
| **권한** | 로그인 |
| **설명** | 전체 설정을 한 번에 저장 (2.1 응답에서 `url`, `thumbnailUrl`, `updatedAt`을 뻐 형식) |

```json
{
  "background": {
    "type": "GIF",
    "source": "PRESET",
    "presetId": 5,
    "assetId": null,
    "fit": "TILE",
    "opacity": 80,
    "dim": 20,
    "blur": 0
  },
  "fontScale": "L",
  "textShadow": true,
  "pauseOnLowPower": true,
  "autoplayOnDataSaver": false
}
```

**검증**

| **조건** | **오류** |
| --- | --- |
| `source = PRESET`인데 `presetId`가 없거나 종류(GIF/MP4)가 다름 | `400 INVALID_BACKGROUND` |
| `source = UPLOAD`인데 `assetId`가 본인 파일이 아니거나 종류가 다름 | `400 INVALID_BACKGROUND` |
| `opacity`, `dim`, `blur`가 0~100 밖 | `400 VALIDATION_FAILED` |
| MP4에 `fit`이 `COVER`가 아님 | 무시하고 `COVER`로 저장 |
- 성공 `200`: 2.1과 같은 형식
- 로그인 직후 LocalStorage에 게스트 설정이 있고 서버 설정이 기본값이면, 프론트가 이 API로 옮겨 저장 (업로드 파일은 옮기지 않음)

### 2.3. 기본 테마로 초기화

- `DELETE /api/me/theme` → `200` + 기본값 (2.1 형식)
- 업로드한 파일은 지우지 않음 (다시 선택 가능)

### 2.4. 기본 제공 배경 목록

- `GET /api/theme/presets?type=GIF` (`type` 생략 시 전체)

```json
{
  "items": [
    {
      "presetId": 5,
      "type": "GIF",
      "name": "밤하늘 별",
      "url": "https://cdn.example.com/presets/stars.gif",
      "thumbnailUrl": "https://cdn.example.com/presets/stars.jpg"
    }
  ]
}
```

### 2.5. 배경 파일 업로드

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `POST /api/me/theme/assets` (`multipart/form-data`, part 이름 `file`) |
| **권한** | 로그인 |
| **처리** | 파일 내용으로 형식 판별 → 용량·길이 검사 → 저장 → 첫 프레임 썸네일 생성. MP4는 오디오 트랙을 제거해 저장 |

| **형식** | **제약** |
| --- | --- |
| GIF | `.gif`, 10MB 이하 |
| MP4 | `.mp4`(H.264 권장), 30MB 이하, 30초 이하 (15초 내외 루프 권장) |

**Response 201**

```json
{
  "assetId": "ab12cd34-0000-4000-8000-000000000001",
  "type": "MP4",
  "url": "https://cdn.example.com/themes/ab12cd34.mp4",
  "thumbnailUrl": "https://cdn.example.com/themes/ab12cd34.jpg",
  "sizeBytes": 18432000,
  "durationSec": 14.8
}
```

| **상황** | **응답** |
| --- | --- |
| 용량 초과 | `413 FILE_TOO_LARGE` → 압축 안내 |
| GIF·MP4 아님 | `415 UNSUPPORTED_FILE_TYPE` |
| 영상 30초 초과 | `400 VIDEO_TOO_LONG` |
| 업로드 파일 5개 초과 | `409 ASSET_LIMIT_EXCEEDED` → 기존 파일 삭제 안내 |

### 2.6. 업로드 파일 삭제

- `DELETE /api/me/theme/assets/{assetId}` → `204`
- 현재 배경으로 쓰는 파일을 지우면 배경은 `NONE`으로 바뀌고 나머지 설정은 유지
- 본인 파일이 아니면 `404`

## 3. DB 매핑 및 보완 필요 사항

- 현재 DB에 테마 관련 테이블이 없어 아래 테이블 추가가 필요함

| **테이블** | **주요 컬럼** |
| --- | --- |
| `UserThemes` | `user_id`(PK, FK), `background_type`, `background_source`, `preset_id`, `asset_id`, `fit`, `opacity`, `dim`, `blur`, `font_scale`, `text_shadow`, `pause_on_low_power`, `autoplay_on_data_saver`, `updated_at` |
| `ThemeAssets` | `asset_id`(PK), `user_id`, `type`, `file_url`, `thumbnail_url`, `size_bytes`, `duration_sec`, `created_at` |
| `ThemePresets` | `preset_id`(PK), `type`, `name`, `file_url`, `thumbnail_url`, `sort_order` |

**임의로 정한 값**

- MP4 최대 길이 30초, 사용자당 업로드 5개 제한은 임시값입니다 (기능 명세는 15초 내외 권장).
- GIF 용량은 기능 명세의 "권장"을 서버 제한(10MB)으로 정했습니다.
- 게스트 설정을 로그인 후 계정으로 옮기는 동작은 기능 명세에 없어 추가했습니다.