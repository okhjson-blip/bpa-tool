import { validationResult } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array();
    return res.status(400).json({
      error: '입력값을 확인해 주세요.',
      issues: details.map((item) => item.msg),
      errors: details
    });
  }
  next();
};
