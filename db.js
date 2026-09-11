const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "123456",
  charset: "utf8mb4",
};

const DB_NAME = "javaguide_report";

async function createPool() {
  // 先不带 database 连接，确保库存在，再建池
  const boot = await mysql.createConnection(DB_CONFIG);
  await boot.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await boot.end();

  const pool = mysql.createPool({ ...DB_CONFIG, database: DB_NAME, waitForConnections: true, connectionLimit: 8 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chapters (
      code CHAR(2) PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      blurb VARCHAR(128) NOT NULL,
      ord INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id VARCHAR(8) PRIMARY KEY,
      chapter_code CHAR(2) NOT NULL,
      grp VARCHAR(128) NOT NULL DEFAULT '',
      title VARCHAR(191) NOT NULL,
      url VARCHAR(512) NOT NULL,
      ext TINYINT NOT NULL DEFAULT 0,
      ord INT NOT NULL,
      KEY idx_chapter (chapter_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS read_marks (
      article_id VARCHAR(8) PRIMARY KEY,
      read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_read_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS section_reads (
      article_id VARCHAR(8) NOT NULL,
      heading_id VARCHAR(191) NOT NULL,
      read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (article_id, heading_id),
      CONSTRAINT fk_section_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await seedIfEmpty(pool);
  return pool;
}

async function seedIfEmpty(pool) {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM articles");
  if (n > 0) return 0;
  const chapters = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "chapters.json"), "utf8"));
  let count = 0;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    await pool.query("INSERT INTO chapters (code, name, blurb, ord) VALUES (?,?,?,?)", [c.code, c.name, c.blurb, i]);
    const rows = c.articles.map((a, j) => [a.id, c.code, a.group || "", a.title, a.url, a.ext ? 1 : 0, j]);
    for (let k = 0; k < rows.length; k += 100) {
      await pool.query("INSERT INTO articles (id, chapter_code, grp, title, url, ext, ord) VALUES ?", [rows.slice(k, k + 100)]);
    }
    count += rows.length;
  }
  console.log(`[db] 已导入目录数据：${chapters.length} 章 / ${count} 篇`);
  return count;
}

module.exports = { createPool, DB_CONFIG, DB_NAME };

if (require.main === module) {
  createPool().then(async (pool) => {
    console.log("[db] 就绪");
    await pool.end();
  }).catch((e) => { console.error("[db] 初始化失败：", e.message); process.exit(1); });
}
