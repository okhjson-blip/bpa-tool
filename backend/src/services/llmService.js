const REQUEST_TIMEOUT_MS = 60000;

const MODEL_BY_ENGINE = Object.freeze({
  chatgpt: process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano',
  gemini: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  claude: 'claude-sonnet-5'
});

const SYSTEM_PROMPT = '당신은 비즈니스 프로세스 분석 전문가입니다. 입력 데이터에 근거해 과장 없이 분석하고 지정된 JSON 스키마로만 응답하세요.';

const PROCESS_SCHEMA = {
  type: 'object',
  properties: {
    processes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['L4', 'L5', 'L6'] },
          name: { type: 'string', description: 'L4 모듈/L5 단위는 간결한 명사형. L6 Act는 반드시 조사 을/를이 포함된 목적어 뒤에 단 하나의 동사가 오는 한국어 행동 문장(예: 데이터를 수집한다)' },
          description: { type: 'string' },
          execution_time: { type: 'integer' },
          waiting_time: { type: 'number' },
          approval_waiting_time: { type: 'number' },
          method: { type: ['string', 'null'], enum: ['manual', 'system', null] },
          tool: { type: ['string', 'null'], enum: ['email', 'document', 'excel', 'web', 'erp', 'other', null] }
        },
        required: [
          'level', 'name', 'description', 'execution_time', 'waiting_time',
          'approval_waiting_time', 'method', 'tool'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['processes'],
  additionalProperties: false
};

const BDW_SCHEMA = {
  type: 'object',
  properties: {
    diagnoses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          process_id: { type: 'integer' },
          bdw_type: { type: 'string', enum: ['bottleneck', 'delay', 'waste', 'normal'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' }
        },
        required: ['process_id', 'bdw_type', 'severity', 'rationale'],
        additionalProperties: false
      }
    }
  },
  required: ['diagnoses'],
  additionalProperties: false
};

const AI_FIT_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          process_id: { type: 'integer' },
          ai_possibility: { type: 'number' },
          inefficiency: { type: 'number' },
          recommended_tech: { type: 'string' },
          difficulty: { type: 'string', enum: ['low', 'medium', 'high'] },
          estimated_time_savings: { type: 'integer' },
          rationale: { type: 'string' }
        },
        required: [
          'process_id', 'ai_possibility', 'inefficiency', 'recommended_tech', 'difficulty',
          'estimated_time_savings', 'rationale'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['analysis'],
  additionalProperties: false
};

function compactProcesses(processes) {
  return processes.map((process) => ({
    id: process.id,
    name: process.name,
    description: process.description || '',
    execution_time_minutes: Number(process.execution_time) || 0,
    waiting_time_hours: Number(process.waiting_time) || 0,
    approval_waiting_time_hours: Number(process.approval_waiting_time) || 0,
    method: process.method || 'manual',
    tool: process.tool || 'other'
  }));
}

function parseStructuredText(text, providerName) {
  if (!text) throw new Error(`${providerName} API가 분석 결과를 반환하지 않았습니다.`);
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error(`${providerName} 구조화 응답을 해석할 수 없습니다.`);
  }
}

async function fetchJson(url, options, providerName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (!response.ok) {
      const message = data.error?.message || data.message || response.statusText;
      const error = new Error(`${providerName} API 오류 (${response.status}): ${message}`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${providerName} API 응답 시간이 초과되었습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

class LLMProvider {
  constructor(apiKey, model, providerName) {
    this.apiKey = apiKey;
    this.model = model;
    this.providerName = providerName;
  }

  async generateStructured() {
    throw new Error('Not implemented');
  }

  analyzeInterview(transcription, taskContext = {}) {
    const prompt = `다음 인터뷰를 STATIK 업무 계층 정의와 실제 실행 순서에 따라 L4 모듈, L5 단위, L6 Act로 분해하세요.

[STATIK 계층 정의]
- L1 구분(조직 기능): 기업 밸류체인 영역이며 이 일이 속한 큰 조직 기능 단위입니다.
- L2 대분류(업무 도메인): 조직 기능별 핵심 업무이며 L1 내에서 구분되는 업무 도메인입니다.
- L3 중분류(핵심 기능): 업무 도메인을 구성하는 목적별 세부 기능이며 분석 단위가 되는 핵심 기능 영역입니다.
- L4 모듈: 독립 업무가 연결되어 완성되는 업무 모듈이며 실제로 관리·인식되는 관련 업무의 묶음입니다. 담당자가 "이 업무를 담당한다"고 말하는 과제 등록 단위로, 등록 과제와 일치하는 L4를 한 번만 작성하세요.
- L5 단위(독립 업무): "이 일을 했다"고 말할 수 있는 독립적 결과물이며 완료 여부를 명확히 확인할 수 있는 단위입니다. 명사형으로 간결하게 작성하세요.
- L6 Act(최소 행위): 더 이상 쪼갤 수 없는 사람의 실제 행동이며 수행 시간(분) 필수 입력 및 BDW 진단 기준 단위입니다.
- 모든 L6 Act의 name은 반드시 한국어 목적격 조사 "을" 또는 "를"이 포함된 "목적어 + 단일 동사" 한 문장으로 작성하고, 마지막 글자는 "다"로 끝내세요.
- 올바른 예: "트렌드 키워드를 검색한다", "초안을 작성한다", "검토 요청 메일을 발송한다", "수정사항을 반영한다".
- 잘못된 예: "자료 수집"(동사 없음), "검토자에게 전달한다"(을/를 목적어 없음), "자료를 수집 및 정리한다"(행동 2개), "자료를 수집하고 저장한다"(행동 2개).
- 두 행동이 필요하면 반드시 L6 행 2개로 분리하세요. L6 Act 이름에 "및", "/", "하고"를 사용하지 마세요.
- JSON을 반환하기 직전에 모든 L6 name을 자체 점검하여 (1) "을/를" 포함, (2) 문장 끝 "다", (3) 동작 하나, (4) 금지 연결어 없음의 네 조건을 모두 만족하도록 고치세요.
- 출력 순서는 L4 모듈 1개 다음에 각 L5 단위와 그에 속하는 L6 Act들을 실제 수행 순서대로 배치하세요.
- L6 Act execution_time은 분 단위 정수, waiting_time과 approval_waiting_time은 시간 단위 숫자입니다.
- L4 모듈과 L5 단위의 모든 시간 값은 0으로 작성하세요. 인터뷰에 명시되지 않은 시간은 합리적인 보수 추정값을 사용하세요.
- 작업방식(method)과 도구(tool)는 L6 Act에만 지정하고 L4 모듈과 L5 단위는 null로 작성하세요.

[등록된 업무 계층]
L1 구분: ${taskContext.l1 || '미등록'}
L2 대분류: ${taskContext.l2 || '미등록'}
L3 중분류: ${taskContext.l3 || '미등록'}
L4 모듈: ${taskContext.l4 || taskContext.name || '인터뷰에서 식별'}

[인터뷰]
${transcription}`;
    return this.generateStructured('bpa_process_draft', PROCESS_SCHEMA, prompt);
  }

  analyzeBDW(processes) {
    const prompt = `다음 L6 Act를 Bottleneck, Delay, Waste, normal 중 하나로 진단하세요.
Bottleneck은 처리량을 제한하는 과부하 단계, Delay는 대기·승인 지연, Waste는 제거해도 가치가 거의 변하지 않는 단계입니다.
모든 process_id를 정확히 한 번씩 포함하세요.

[프로세스]
${JSON.stringify(compactProcesses(processes))}`;
    return this.generateStructured('bpa_bdw_diagnosis', BDW_SCHEMA, prompt);
  }

  analyzeAIFit(processes) {
    const prompt = `다음 L6 Act별 AI 적용 가능성과 현재 비효율성을 각각 1.0~5.0으로 평가하세요.
추천 기술, 비개발자 관점 구현 난이도(low=하, medium=중, high=상), 현재 수행시간을 넘지 않는 예상 절감시간(분), 짧은 근거를 제공하고 모든 process_id를 정확히 한 번씩 포함하세요.

[프로세스]
${JSON.stringify(compactProcesses(processes))}`;
    return this.generateStructured('bpa_ai_fit', AI_FIT_SCHEMA, prompt);
  }
}

class OpenAIProvider extends LLMProvider {
  constructor(apiKey) {
    super(apiKey, MODEL_BY_ENGINE.chatgpt, 'OpenAI');
  }

  async generateStructured(schemaName, schema, prompt) {
    const data = await fetchJson('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 8192,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        text: {
          format: { type: 'json_schema', name: schemaName, strict: true, schema }
        }
      })
    }, this.providerName);

    if (data.status === 'incomplete') {
      throw new Error(`OpenAI 응답이 완료되지 않았습니다: ${data.incomplete_details?.reason || 'unknown'}`);
    }
    const refusal = data.output?.flatMap((item) => item.content || [])
      .find((content) => content.type === 'refusal');
    if (refusal) throw new Error(`OpenAI 요청 거부: ${refusal.refusal || '분석할 수 없습니다.'}`);
    const text = data.output_text || data.output?.flatMap((item) => item.content || [])
      .filter((content) => content.type === 'output_text')
      .map((content) => content.text || '')
      .join('');
    return parseStructuredText(text, this.providerName);
  }
}

class GeminiProvider extends LLMProvider {
  constructor(apiKey) {
    super(apiKey, MODEL_BY_ENGINE.gemini, 'Gemini');
  }

  async generateStructured(schemaName, schema, prompt) {
    const data = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            responseFormat: {
              text: {
                mimeType: 'APPLICATION_JSON',
                schema
              }
            }
          }
        })
      },
      this.providerName
    );
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('');
    return parseStructuredText(text, this.providerName);
  }
}

class ClaudeProvider extends LLMProvider {
  constructor(apiKey) {
    super(apiKey, MODEL_BY_ENGINE.claude, 'Claude');
  }

  async generateStructured(schemaName, schema, prompt) {
    const data = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        output_config: {
          format: { type: 'json_schema', schema }
        }
      })
    }, this.providerName);
    const text = data.content?.filter((block) => block.type === 'text')
      .map((block) => block.text || '')
      .join('');
    return parseStructuredText(text, this.providerName);
  }
}

export class LLMService {
  static getProvider(engine, apiKey) {
    const normalizedEngine = String(engine || '').toLowerCase();
    if (normalizedEngine === 'chatgpt') return new OpenAIProvider(apiKey);
    if (normalizedEngine === 'gemini') return new GeminiProvider(apiKey);
    if (normalizedEngine === 'claude') return new ClaudeProvider(apiKey);
    throw new Error(`지원하지 않는 AI 엔진입니다: ${engine}`);
  }

  static getModel(engine) {
    return MODEL_BY_ENGINE[String(engine || '').toLowerCase()] || null;
  }

  static analyzeInterview(engine, apiKey, transcription, taskContext = {}) {
    return this.getProvider(engine, apiKey).analyzeInterview(transcription, taskContext);
  }

  static analyzeBDW(engine, apiKey, processes) {
    return this.getProvider(engine, apiKey).analyzeBDW(processes);
  }

  static analyzeAIFit(engine, apiKey, processes) {
    return this.getProvider(engine, apiKey).analyzeAIFit(processes);
  }

  static async testConnection(engine, apiKey) {
    const normalizedEngine = String(engine || '').toLowerCase();
    const normalizedKey = String(apiKey || '').trim();
    const model = this.getModel(normalizedEngine);

    if (!model || normalizedKey.length < 20 || /\s/.test(normalizedKey)) {
      const error = new Error('Invalid API key or engine');
      error.code = 'INVALID_API_KEY';
      error.userMessage = model ? 'API Key 형식이 올바르지 않습니다.' : '지원하지 않는 AI 엔진입니다.';
      throw error;
    }

    const requestByEngine = {
      chatgpt: {
        name: 'OpenAI',
        url: `https://api.openai.com/v1/models/${model}`,
        headers: { Authorization: `Bearer ${normalizedKey}` }
      },
      gemini: {
        name: 'Gemini',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}`,
        headers: { 'x-goog-api-key': normalizedKey }
      },
      claude: {
        name: 'Claude',
        url: `https://api.anthropic.com/v1/models/${model}`,
        headers: { 'x-api-key': normalizedKey, 'anthropic-version': '2023-06-01' }
      }
    };

    try {
      await fetchJson(requestByEngine[normalizedEngine].url, {
        method: 'GET',
        headers: requestByEngine[normalizedEngine].headers
      }, requestByEngine[normalizedEngine].name);
      return { engine: normalizedEngine, model };
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        error.code = 'INVALID_API_KEY';
        error.userMessage = 'API Key가 유효하지 않거나 선택 모델에 대한 권한이 없습니다.';
      } else if (error.status === 404) {
        error.userMessage = `${model} 모델을 현재 API 계정에서 사용할 수 없습니다.`;
      }
      throw error;
    }
  }
}

export default LLMService;
