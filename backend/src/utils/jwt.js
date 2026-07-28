import jwt from 'jsonwebtoken';

export const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

export const generateResetToken = (userId) => {
  return jwt.sign(
    { userId, type: 'password-reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

export const verifyResetToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};
