import { validationResult } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((item) => ({
      location: item.location,
      path: item.path,
      msg: item.msg
    }));
    return res.status(400).json({
      error: '입력값을 확인해 주세요.',
      issues: details.map((item) => item.msg),
      errors: details
    });
  }
  next();
};
