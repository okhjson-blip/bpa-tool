import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { generateToken, generateResetToken, verifyResetToken } from '../utils/jwt.js';

export const signup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, name, role } = req.body;

  try {
    const existingUser = db.selectOne('users', { email });
    if (existingUser) {
      return res.status(400).json({ error: '이미 존재하는 이메일입니다' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = db.insert('users', {
      email,
      password: hashedPassword,
      name,
      role: role || 'client'
    });

    const token = generateToken(user);
    const { password: _, ...userResponse } = user;

    res.status(201).json({
      message: '회원가입이 완료되었습니다',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다' });
  }
};

export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = db.selectOne('users', { email });
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 잘못되었습니다' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 잘못되었습니다' });
    }

    const token = generateToken(user);
    const { password: _, ...userResponse } = user;

    res.json({
      message: '로그인이 완료되었습니다',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다' });
  }
};

export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const user = db.selectOne('users', { email });
    if (!user) {
      // 보안을 위해 사용자 존재 여부를 노출하지 않음
      return res.json({
        message: '비밀번호 초기화 링크가 발송되었습니다'
      });
    }

    const resetToken = generateResetToken(user.id);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.insert('password_reset_tokens', {
      user_id: user.id,
      token: resetToken,
      expires_at: expiresAt
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    console.log('🔐 비밀번호 초기화 링크:', resetLink);

    res.json({
      message: '비밀번호 초기화 링크가 발송되었습니다',
      resetLink // 개발용 (프로덕션에서 제거)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '비밀번호 초기화 요청 중 오류가 발생했습니다' });
  }
};

export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = verifyResetToken(token);
    if (!decoded) {
      return res.status(400).json({ error: '유효하지 않거나 만료된 토큰입니다' });
    }

    const resetTokenRecord = db.selectOne('password_reset_tokens', { token });
    if (!resetTokenRecord || new Date(resetTokenRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: '토큰이 만료되었습니다' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.update('users', decoded.userId, { password: hashedPassword });

    db.deleteWhere('password_reset_tokens', { token });

    res.json({ message: '비밀번호가 변경되었습니다' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다' });
  }
};
