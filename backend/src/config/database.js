import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/db.json');

// JSON 기반 데이터베이스
class SimpleDB {
  constructor() {
    this.data = {
      users: [],
      projects: [],
      tasks: [],
      task_members: [],
      domains: [],
      project_members: [],
      password_reset_tokens: [],
      interviews: [],
      processes: [],
      bdw_tags: [],
      ai_analysis: [],
      to_be_processes: []
    };
    this.nextIds = {
      users: 1,
      projects: 1,
      tasks: 1,
      task_members: 1,
      domains: 1,
      project_members: 1,
      password_reset_tokens: 1,
      interviews: 1,
      processes: 1,
      bdw_tags: 1,
      ai_analysis: 1,
      to_be_processes: 1
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(dbPath)) {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        // 파일의 데이터와 초기 데이터 병합 (누락된 테이블 추가)
        this.data = { ...this.data, ...data.data };
        this.nextIds = { ...this.nextIds, ...data.nextIds };
      } else {
        this.save();
      }
    } catch (e) {
      console.log('Creating new database file');
      this.save();
    }
  }

  save() {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify({ data: this.data, nextIds: this.nextIds }));
  }

  insert(table, data) {
    const id = this.nextIds[table]++;
    const record = { id, ...data, created_at: new Date().toISOString() };
    this.data[table].push(record);
    this.save();
    return record;
  }

  select(table, condition = null) {
    if (!condition) return this.data[table];
    return this.data[table].filter((row) => {
      for (const [key, value] of Object.entries(condition)) {
        if (row[key] !== value) return false;
      }
      return true;
    });
  }

  selectOne(table, condition) {
    return this.data[table].find((row) => {
      for (const [key, value] of Object.entries(condition)) {
        if (row[key] !== value) return false;
      }
      return true;
    });
  }

  update(table, id, data) {
    const index = this.data[table].findIndex((r) => r.id === id);
    if (index >= 0) {
      this.data[table][index] = {
        ...this.data[table][index],
        ...data,
        updated_at: new Date().toISOString()
      };
      this.save();
      return this.data[table][index];
    }
    return null;
  }

  delete(table, id) {
    const index = this.data[table].findIndex((r) => r.id === id);
    if (index >= 0) {
      this.data[table].splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  deleteWhere(table, condition) {
    const indices = [];
    this.data[table].forEach((row, index) => {
      let match = true;
      for (const [key, value] of Object.entries(condition)) {
        if (row[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) indices.push(index);
    });

    indices.reverse().forEach((index) => {
      this.data[table].splice(index, 1);
    });

    if (indices.length > 0) this.save();
    return indices.length;
  }
}

const db = new SimpleDB();

export const initializeDatabase = async () => {
  console.log('✓ Database initialized (JSON-based in-memory)');
};

export { db };
