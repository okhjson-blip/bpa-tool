import fetch from 'node-fetch';

// LLM 인터페이스 추상화
class LLMProvider {
  async analyzeInterview(transcription, level) {
    throw new Error('Not implemented');
  }
}

// ChatGPT (OpenAI)
class ChatGPTProvider extends LLMProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';
  }

  async analyzeInterview(transcription, level) {
    const prompt = this.buildPrompt(transcription, level);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a business process analysis expert. Analyze the transcription and extract process steps.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseResponse(data.choices[0].message.content);
    } catch (error) {
      console.error('ChatGPT API error:', error);
      throw error;
    }
  }

  buildPrompt(transcription, level) {
    if (level === 'L4') {
      return `
분석 대상 인터뷰 내용:
${transcription}

요청: 위 인터뷰 내용을 바탕으로 다음을 추출하세요:
1. L4 모듈 (주요 업무 프로세스)
2. L5 단위 작업 (각 모듈 내 세부 단계)
3. L6 액션 (구체적인 작업 항목)

JSON 형식으로 다음과 같이 응답하세요:
{
  "modules": [
    {
      "name": "모듈명",
      "description": "설명",
      "units": [
        {
          "name": "단위 작업명",
          "actions": [
            {
              "name": "액션명",
              "method": "수작업|시스템",
              "tool": "도구",
              "time_minutes": 30
            }
          ]
        }
      ]
    }
  ]
}
      `;
    }
    return transcription;
  }

  parseResponse(content) {
    try {
      // JSON 추출 시도
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
    return { raw: content };
  }
}

// Gemini (Google)
class GeminiProvider extends LLMProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  }

  async analyzeInterview(transcription, level) {
    const prompt = this.buildPrompt(transcription, level);

    try {
      const response = await fetch(`${this.baseURL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.candidates[0].content.parts[0].text;
      return this.parseResponse(content);
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  buildPrompt(transcription, level) {
    return `
인터뷰 내용을 분석하여 비즈니스 프로세스 L${level} 레벨로 분해해주세요.

[인터뷰 내용]
${transcription}

[요청 형식]
JSON으로 다음 구조를 따라 응답해주세요:
{
  "processes": [
    {
      "level": "L${level}",
      "name": "프로세스명",
      "description": "설명",
      "execution_time": 30,
      "method": "수작업|시스템",
      "tool": "도구명"
    }
  ]
}
    `;
  }

  parseResponse(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
    return { raw: content };
  }
}

// Claude (Anthropic)
class ClaudeProvider extends LLMProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.baseURL = 'https://api.anthropic.com/v1/messages';
  }

  async analyzeInterview(transcription, level) {
    const prompt = this.buildPrompt(transcription, level);

    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.content[0].text;
      return this.parseResponse(content);
    } catch (error) {
      console.error('Claude API error:', error);
      throw error;
    }
  }

  buildPrompt(transcription, level) {
    return `당신은 비즈니스 프로세스 분석 전문가입니다.

다음 인터뷰 내용을 L${level} 레벨로 분석하고 JSON 형식으로 응답하세요:

[인터뷰]
${transcription}

[응답 형식]
\`\`\`json
{
  "processes": [
    {
      "level": "L${level}",
      "name": "프로세스명",
      "description": "간단한 설명",
      "execution_time": 30,
      "method": "수작업",
      "tool": "도구명"
    }
  ]
}
\`\`\``;
  }

  parseResponse(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
    return { raw: content };
  }
}

// LLM Factory
export class LLMService {
  static getProvider(engine, apiKey) {
    switch (engine.toLowerCase()) {
      case 'chatgpt':
        return new ChatGPTProvider(apiKey);
      case 'gemini':
        return new GeminiProvider(apiKey);
      case 'claude':
        return new ClaudeProvider(apiKey);
      default:
        throw new Error(`Unknown LLM engine: ${engine}`);
    }
  }

  static async analyzeInterview(engine, apiKey, transcription, level = 'L4') {
    const provider = this.getProvider(engine, apiKey);
    return await provider.analyzeInterview(transcription, level);
  }
}

export default LLMService;
