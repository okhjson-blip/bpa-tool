# 결과 리포트 DB 이관용 CSV 양식

## 목적

결과 리포트의 DB 이관 대상 데이터를 다른 데이터베이스로 옮기기 위한 UTF-8 CSV 양식입니다. CSV는 과제 리포트당 한 행이며 첫 열의 `csv_schema_version`으로 호환성을 확인합니다. BDW 진단과 AI FIT 분석은 CSV에서 제외합니다.

## 열 정의

| 열 | 권장 DB 형식 | 설명 |
|---|---|---|
| `csv_schema_version` | text | 양식 버전. 현재 `bpa-task-report-csv-v2` |
| `source_table` | text | 원본 테이블. 현재 `task_reports` |
| `source_company_id` | bigint | 원본 DB 협력사 ID |
| `source_project_id` | bigint | 원본 DB 프로젝트 ID |
| `source_task_id` | bigint | 원본 DB 과제 ID |
| `company_name` | text | 협력사명과 대상 DB ID 매핑 기준 |
| `project_name` | text | 프로젝트명 |
| `task_name` | text | 과제명 |
| `task_start_date` | date | 과제 시작일 |
| `task_end_date` | date | 과제 종료일 |
| `report_title` | text | 결과 리포트 제목 |
| `report_format` | text | 리포트 형식. 현재 `pdf` |
| `report_version` | smallint | 리포트 데이터 버전 |
| `report_generated_at` | timestamptz | 리포트 생성 시각 |
| `report_saved_at` | timestamptz | 리포트 정식 저장 시각 |
| `analysis_period` | text | 프로젝트 분석 기간 |
| `hierarchy_json` | jsonb | STATIK L1~L4 구조 |
| `task_goal` | text | 과제 목표 |
| `project_participants_json` | jsonb | 프로젝트 참여자 배열 |
| `task_participants_json` | jsonb | 과제 참여자 배열 |
| `as_is_processes_json` | jsonb | AS-IS L6 프로세스 배열. BDW 태그 제외 |
| `to_be_processes_json` | jsonb | To-Be L6 프로세스 배열 |
| `statistics_json` | jsonb | AX 성과지표와 수행 빈도 |
| `report_data_json` | jsonb | 이관 대상 리포트 스냅샷. BDW 진단·AI FIT 분석·AI FIT 추천과 AS-IS의 BDW 태그 제외 |

## 적재 규칙

1. UTF-8 BOM을 제거하고 CSV 헤더의 `csv_schema_version`을 확인합니다.
2. `source_*_id`는 원본 식별자이므로 대상 DB의 기존 ID와 충돌하면 회사명·프로젝트명·과제명으로 대상 ID를 매핑합니다.
3. `_json` 열은 문자열이 아니라 JSON/JSONB 형식으로 변환해 적재합니다.
4. CSV 범위의 결과 리포트를 복원할 때는 `report_data_json`을 대상 리포트 JSON 열에 저장합니다.
5. 섹션별 분석 테이블을 별도로 구성할 때는 각 섹션 JSON 열을 펼쳐 적재하되 배열 순서를 표시 순서로 유지합니다.
6. 리포트는 과제당 최신 한 건이므로 대상 `task_id` 기준 upsert를 권장합니다.

## 제외 데이터

- `bdw_diagnosis`
- `ai_fit_analysis`
- AI FIT에서 파생된 `recommendations`
- `as_is_processes` 각 항목의 `bdw_type`, `bdw_severity`

CSV의 JSON 셀은 RFC 4180 방식으로 큰따옴표가 이스케이프되며, 스프레드시트 수식 주입 방지를 위해 위험한 일반 텍스트 값은 앞에 작은따옴표가 추가될 수 있습니다.
