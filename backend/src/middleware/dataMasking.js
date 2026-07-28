// 민감정보 패턴 정의
const SENSITIVE_PATTERNS = {
  email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  phone: /(\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4})/g,
  ssn: /(\d{3}[-.\s]?\d{2}[-.\s]?\d{4})/g,
  creditCard: /(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})/g,
  corpName: /(주식회사|회사|기업|부서|팀|팀장|직급|부장|과장|대리)/gi,
  username: /([A-Za-z0-9_]{3,})/g
};

export const maskSensitiveData = (text) => {
  if (!text) return text;

  let masked = text;

  // 이메일 마스킹: example@email.com → e***@email.com
  masked = masked.replace(SENSITIVE_PATTERNS.email, (match) => {
    const [local, domain] = match.split('@');
    return `${local.charAt(0)}***@${domain}`;
  });

  // 전화번호 마스킹: 010-1234-5678 → 010-****-5678
  masked = masked.replace(SENSITIVE_PATTERNS.phone, (match) => {
    const digits = match.replace(/\D/g, '');
    return digits.slice(0, 3) + '-****-' + digits.slice(-4);
  });

  // 사업자번호 마스킹
  masked = masked.replace(SENSITIVE_PATTERNS.ssn, (match) => {
    const digits = match.replace(/\D/g, '');
    return digits.slice(0, 3) + '-**-' + digits.slice(-4);
  });

  return masked;
};

export const dataMaskingMiddleware = (req, res, next) => {
  // 인터뷰 데이터 마스킹
  if (req.method === 'POST' && req.path.includes('/interviews')) {
    if (req.body.transcription) {
      req.body.transcriptionMasked = maskSensitiveData(req.body.transcription);
    }
    if (req.body.text) {
      req.body.textMasked = maskSensitiveData(req.body.text);
    }
  }

  next();
};

export default maskSensitiveData;
