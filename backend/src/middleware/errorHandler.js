export const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || '서버 오류가 발생했습니다'
  });
};

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
