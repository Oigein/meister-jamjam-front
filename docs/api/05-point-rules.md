## 1. 개요

- **관련 기능 명세**: 상벌점 기준 조회 (1)
- **공통 규칙**: [[API] 공통 규칙](https://app.notion.com/p/API-40762fa2a99981e186b3fcbdaac53457?pvs=21)
- **목적**: 현재 시행 중인 상점·벌점 기준을 조회. 조회 전용이며 기준 등록·수정·삭제 API는 이 기능에 포함하지 않음
- **사용 방식**: 항목 수가 많지 않아 화면 진입 시 파라미터 없이 전체를 한 번 불러오고, 필터·검색은 화면에서 처리. 필터 파라미터는 다른 화면·외부 연동을 위해 서버도 지원

| **Method** | **URL** | **권한** | **설명** |
| --- | --- | --- | --- |
| GET | `/api/point-rules` | 로그인 | 상벌점 기준 목록 조회 |

## 2. 상세 API

### 2.1. 상벌점 기준 목록 조회

| **구분** | **내용** |
| --- | --- |
| **Method / URL** | `GET /api/point-rules?type=&category=&q=` |
| **권한** | 로그인한 모든 구성원 (학생·교사 동일). 비로그인 `401` |
| **설명** | 현재 시행 중(`is_active = true`)인 기준만 반환. 폐지된 기준은 포함하지 않음 |

**Query Parameter** (모두 선택, 함께 주면 AND)

| **이름** | **타입** | **설명** |
| --- | --- | --- |
| `type` | PointType | `MERIT` / `DEMERIT`. 허용되지 않은 값이면 **무시하고 전체 조회** (오류 아님) |
| `category` | string (반복 가능) | 분류. 여러 개는 `category=생활&category=학습` (OR) |
| `q` | string | 항목명·세부 기준에 포함된 글자 검색 (앞뒤 공백 제거, 최대 50자) |

**Response 200**

```json
{
  "total": 3,
  "categories": ["생활", "학습", "봉사", "기숙사"],
  "items": [
    {
      "ruleId": 1,
      "type": "MERIT",
      "category": "봉사",
      "title": "교내 봉사활동",
      "points": 3,
      "description": "담당 교사가 확인한 교내 봉사활동 1회",
      "note": "하루 1회만 인정"
    },
    {
      "ruleId": 7,
      "type": "DEMERIT",
      "category": "생활",
      "title": "지각",
      "points": 1,
      "description": "조회 시작 이후 등교",
      "note": null
    }
  ]
}
```

| **필드** | **설명** |
| --- | --- |
| `total` | 조건에 맞는 항목 수 (화면의 "총 N개") |
| `categories` | 현재 시행 중인 기준의 분류 전체 (분류 칩용, 필터와 관계없이 항상 전체) |
| `points` | 양의 정수. 화면에서 상점은 `+3`(파랑), 벌점은 `-1`(빨강)로 표시 |
| `description`, `note` | 선택 값. 없으면 `null` |

**정렬**: 구분(상점 → 벌점) → 분류 → 점수 큰 순

**처리 규칙**

| **구분** | **내용** |
| --- | --- |
| **최신성** | 기준이 바뀌면 다음 조회부터 바로 반영. `Cache-Control: no-cache`  • `ETag` 제공 (변경 없으면 `304`) |
| **요청 제한** | IP당 분당 60회, 초과 시 `429`  • `Retry-After` |
| **페이지** | 없음 (항목 100개 이하 가정) |

**예외 처리**

| **상황** | **응답** | **프론트 처리** |
| --- | --- | --- |
| 조건에 맞는 기준 없음 | `200`, `total: 0`, `items: []` | "조건에 맞는 기준이 없습니다." + [필터 초기화] |
| 등록된 기준이 하나도 없음 | `200`, `total: 0`, `categories: []` | "등록된 기준이 없습니다. 담당 선생님께 문의하세요." |
| 허용되지 않은 `type` | `200`, 전체 조회 | 별도 처리 없음 |
| 서버 오류·응답 지연 | `500` | "기준을 불러오지 못했습니다. 다시 시도하세요." + [다시 시도] |
| 세션 만료 | `401` | 로그인 후 이 화면으로 복귀 |
| 요청 과다 | `429` | 잠시 후 다시 시도 안내 |

## 3. DB 매핑 및 보완 필요 사항

- 현재 DB에 상벌점 기준 테이블이 없어 아래 테이블 추가가 필요함

```sql
CREATE TABLE `PointRules` (
  `rule_id`     INT          NOT NULL AUTO_INCREMENT,
  `type`        ENUM('MERIT','DEMERIT') NOT NULL,
  `category`    VARCHAR(20)  NOT NULL,
  `title`       VARCHAR(50)  NOT NULL,
  `points`      INT          NOT NULL,
  `description` VARCHAR(255) NULL,
  `note`        VARCHAR(255) NULL,
  `is_active`   BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`rule_id`)
);
```

- 기준을 바꿀 때는 기존 행을 `is_active = false`로 두고 새 행을 추가 (과거 부여 내역과의 연결 보존)

**임의로 정한 값**

- 서버도 `type`, `category`, `q` 필터를 지원하지만 화면은 전체를 받아 직접 걸러내는 것을 기본으로 했습니다.
- 여러 분류는 반복 파라미터로 받고, 분류끼리는 OR로 처리했습니다.
- 분류 예시(생활·학습·봉사·기숙사)와 분당 60회 제한은 기능 명세의 임시값을 그대로 따랐습니다.