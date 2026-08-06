const REQUEST_TIMEOUT_MS = 60000;

const MODEL_BY_ENGINE = Object.freeze({
  chatgpt: 'gpt-5.6-sol',
  gemini: process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash',
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
          name: { type: 'string' },
          description: { type: 'string' },
          execution_time: { type: 'integer' },
          waiting_time: { type: 'number' },
          approval_waiting_time: { type: 'number' },
          method: { type: 'string', enum: ['manual', 'system'] },
          tool: { type: 'string', enum: ['email', 'document', 'excel', 'web', 'erp', 'other'] }
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
          estimated_time_savings: { type: 'integer' },
          rationale: { type: 'string' }
        },
        required: [
          'process_id', 'ai_possibility', 'inefficiency', 'recommended_tech',
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

  analyzeInterview(transcription) {
    const prompt = `다음 인터뷰를 실행 순서에 맞춰 L4 모듈, L5 단위 업무, L6 실제 행동으로 분해하세요.
L6 execution_time은 분 단위 정수, waiting_time과 approval_waiting_time은 시간 단위 숫자입니다.
L4와 L5의 시간 값은 0으로 작성하세요. 인터뷰에 명시되지 않은 시간은 합리적인 보수 추정값을 사용하세요.

[인터뷰]
${transcription}`;
    return this.generateStructured('bpa_process_draft', PROCESS_SCHEMA, prompt);
  }

  analyzeBDW(processes) {
    const prompt = `다음 L6 프로세스를 Bottleneck, Delay, Waste, normal 중 하나로 진단하세요.
Bottleneck은 처리량을 제한하는 과부하 단계, Delay는 대기·승인 지연, Waste는 제거해도 가치가 거의 변하지 않는 단계입니다.
모든 process_id를 정확히 한 번씩 포함하세요.

[프로세스]
${JSON.stringify(compactProcesses(processes))}`;
    return this.generateStructured('bpa_bdw_diagnosis', BDW_SCHEMA, prompt);
  }

  analyzeAIFit(processes) {
    const prompt = `다음 L6 프로세스별 AI 적용 가능성과 현재 비효율성을 각각 1.0~5.0으로 평가하세요.
추천 기술, 현재 수행시간을 넘지 않는 예상 절감시간(분), 짧은 근거를 제공하고 모든 process_id를 정확히 한 번씩 포함하세요.

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

  static analyzeInterview(engine, apiKey, transcription) {
    return this.getProvider(engine, apiKey).analyzeInterview(transcription);
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
